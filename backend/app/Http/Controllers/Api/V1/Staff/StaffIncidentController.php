<?php

namespace App\Http\Controllers\Api\V1\Staff;

use App\Events\IncidentStatusUpdated;
use App\Events\IncidentVerificationUpdated;
use App\Http\Controllers\Controller;
use App\Http\Requests\Staff\UpdateStaffIncidentStatusRequest;
use App\Http\Resources\Api\V1\IncidentDetailResource;
use App\Http\Resources\Api\V1\IncidentSummaryResource;
use App\Models\Incident;
use App\Models\User;
use App\Services\Admin\CommandCenterService;
use App\Support\ApiResponse;
use App\Support\AuditLogger;
use App\Support\IncidentStatusProgression;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class StaffIncidentController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'status' => ['nullable', 'in:verified,under_assessment,responding,resolved'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $validated = $validator->validated();
        $staff = $request->user();

        $query = $this->staffIncidentQuery($staff)
            ->with($this->incidentSummaryRelations())
            ->select([
                'id',
                'reference_code',
                'reporter_id',
                'is_guest',
                'type',
                'latitude',
                'longitude',
                'address_label',
                'status',
                'is_iot_generated',
                'incident_datetime',
                'created_at',
                'resolved_at',
            ])
            ->orderByDesc('created_at');

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        $incidents = $query->paginate($validated['per_page'] ?? 12)->withQueryString();
        $incidents->getCollection()->transform(
            fn (Incident $incident) => (new IncidentSummaryResource($incident))->resolve()
        );

        return $this->successResponse([
            'incidents' => $incidents,
        ], 'Assigned incidents retrieved successfully.');
    }

    public function show(Request $request, string $incidentId)
    {
        $incident = $this->findAssignedIncident($request->user(), $incidentId);

        if (! $incident) {
            return $this->errorResponse('Incident not found.', [], 404);
        }

        return $this->successResponse([
            'incident' => (new IncidentDetailResource($incident))->resolve(),
        ], 'Assigned incident retrieved successfully.');
    }

    public function updateStatus(UpdateStaffIncidentStatusRequest $request, string $incidentId, CommandCenterService $commandCenter)
    {
        $staff = $request->user();
        $validated = $request->validated();
        $newStatus = $validated['status'];
        $notes = trim((string) $validated['notes']);
        $beforeIncident = $this->staffIncidentQuery($staff)
            ->with(['assignments.staff:id,full_name'])
            ->find($incidentId);
        $before = $beforeIncident ? $this->incidentAuditSnapshot($beforeIncident) : [];
        $unitsCoordinated = collect($validated['units_coordinated'] ?? [])
            ->filter(fn ($unit) => is_string($unit) && trim($unit) !== '')
            ->map(fn ($unit) => trim((string) $unit))
            ->values()
            ->all();

        $updateContext = DB::transaction(function () use (
            $incidentId,
            $staff,
            $newStatus,
            $notes,
            $unitsCoordinated
        ): array {
            $incident = $this->staffIncidentQuery($staff)
                ->lockForUpdate()
                ->find($incidentId);

            if (! $incident) {
                return ['error' => 'not_found'];
            }

            return IncidentStatusProgression::progress(
                $incident,
                $staff,
                $newStatus,
                $notes,
                $unitsCoordinated
            );
        });

        if (($updateContext['error'] ?? null) === 'not_found') {
            return $this->errorResponse('Incident not found.', [], 404);
        }

        if (($updateContext['error'] ?? null) === 'locked') {
            return $this->errorResponse(
                'Incident is already resolved and cannot be updated.',
                ['status' => ['Resolved incidents are locked for edits.']],
                422
            );
        }

        if (($updateContext['error'] ?? null) === 'invalid_transition') {
            $expected = $updateContext['expected_status'] ?? null;
            $message = $expected
                ? "Invalid status progression. Next allowed status is {$expected}."
                : 'Invalid status progression from current incident state.';

            return $this->errorResponse($message, [
                'status' => [$message],
            ], 422);
        }

        $incident = $this->findAssignedIncident($staff, $updateContext['incident_id']);

        event(new IncidentStatusUpdated(
            $incident,
            $staff,
            $updateContext['old_status'],
            $updateContext['new_status'],
            $notes
        ));

        if ($updateContext['new_status'] === 'resolved' && $incident->reporter_id) {
            event(IncidentVerificationUpdated::forUser(
                $incident->reporter_id,
                $incident,
                "Your incident #{$incident->id} has been resolved."
            ));
        }

        if ($incident) {
            AuditLogger::record(
                $staff,
                'staff.incident_status_update',
                $incident,
                $before,
                $this->incidentAuditSnapshot($incident),
                $incident,
                [
                    'old_status' => $updateContext['old_status'],
                    'new_status' => $updateContext['new_status'],
                    'notes' => $notes,
                    'units_coordinated' => $unitsCoordinated,
                    'source' => 'staff_portal',
                ],
            );
        }

        $commandCenter->clear();

        return $this->successResponse([
            'incident' => $incident ? (new IncidentDetailResource($incident))->resolve() : null,
        ], 'Incident status updated successfully.');
    }

    private function incidentAuditSnapshot(Incident $incident): array
    {
        $incident->loadMissing(['assignments.staff:id,full_name']);

        return [
            'reference_code' => $incident->reference_code,
            'type' => $incident->type,
            'status' => $incident->status,
            'address_label' => $incident->address_label,
            'rejection_reason' => $incident->rejection_reason,
            'resolved_at' => $incident->resolved_at?->toIso8601String(),
            'assigned_staff' => $incident->assignments
                ->map(fn ($assignment) => [
                    'id' => $assignment->staff?->id,
                    'full_name' => $assignment->staff?->full_name,
                ])
                ->filter(fn (array $assignedStaff) => ! empty($assignedStaff['id']))
                ->values()
                ->all(),
        ];
    }

    private function staffIncidentQuery(User $staff): Builder
    {
        return Incident::query()
            ->whereHas('assignments', function (Builder $query) use ($staff): void {
                $query->where('staff_id', $staff->id);
            });
    }

    private function findAssignedIncident(User $staff, string $incidentId): ?Incident
    {
        return $this->staffIncidentQuery($staff)
            ->with($this->incidentRelations())
            ->find($incidentId);
    }

    /**
     * @return array<int, string>
     */
    private function incidentRelations(): array
    {
        return [
            'reporter:id,full_name,email,phone,barangay,address,role,status',
            'reporter.emergencyProfile:id,user_id,emergency_contact_name,emergency_contact_phone,is_public',
            'media',
            'latestAssignment.staff:id,full_name,email,phone,barangay,role,status',
            'assignments.staff:id,full_name,email,phone,barangay,role,status',
            'assignments.assignedBy:id,full_name,role',
            'logs.changedByUser:id,full_name,role',
        ];
    }

    /**
     * @return array<int, string>
     */
    private function incidentSummaryRelations(): array
    {
        return [
            'reporter:id,full_name,email,phone,barangay',
            'latestAssignment.staff:id,full_name,email,phone,barangay,role,status',
        ];
    }
}

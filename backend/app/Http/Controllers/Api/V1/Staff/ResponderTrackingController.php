<?php

namespace App\Http\Controllers\Api\V1\Staff;

use App\Http\Controllers\Controller;
use App\Http\Requests\Staff\StoreHealthLogRequest;
use App\Http\Requests\Staff\StoreRoutePointRequest;
use App\Http\Requests\Staff\UpdateResponderTrackingRequest;
use App\Http\Resources\Api\V1\ResponderLocationResource;
use App\Http\Resources\Api\V1\ResponderStatusLogResource;
use App\Models\Incident;
use App\Models\ResponderHealthLog;
use App\Models\ResponderLocation;
use App\Models\ResponderRoutePoint;
use App\Models\ResponderStatusLog;
use App\Services\Admin\CommandCenterService;
use App\Support\ApiResponse;
use App\Support\IncidentStatusProgression;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ResponderTrackingController extends Controller
{
    use ApiResponse;

    private const ACTION_TO_INCIDENT_STATUS = [
        'accepted_request' => 'under_assessment',
        'on_the_way' => 'responding',
        'resolved' => 'resolved',
    ];

    public function show(Request $request)
    {
        $location = ResponderLocation::query()
            ->with([
                'responder:id,full_name,email,phone,barangay,role,status',
                'incident:id,reference_code,type,status,address_label,latitude,longitude',
            ])
            ->where('responder_id', $request->user()->id)
            ->first();

        $statusLogs = ResponderStatusLog::query()
            ->with('responder:id,full_name,phone,barangay')
            ->where('responder_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        return $this->successResponse([
            'location' => $location ? (new ResponderLocationResource($location))->resolve() : null,
            'status_logs' => ResponderStatusLogResource::collection($statusLogs)->resolve(),
        ], 'Responder tracking retrieved successfully.');
    }

    public function update(UpdateResponderTrackingRequest $request, CommandCenterService $commandCenter)
    {
        $staff = $request->user();
        $validated = $request->validated();
        $incident = null;
        $notes = trim((string) ($validated['notes'] ?? ''));

        if (! empty($validated['incident_id'])) {
            $incident = Incident::query()
                ->where('id', $validated['incident_id'])
                ->whereHas('assignments', function (Builder $query) use ($staff): void {
                    $query->where('staff_id', $staff->id);
                })
                ->first();

            if (! $incident) {
                return $this->errorResponse('Assigned incident not found.', [], 404);
            }
        }

        $location = DB::transaction(function () use ($staff, $validated, $incident, $notes) {
            $location = ResponderLocation::query()->updateOrCreate(
                ['responder_id' => $staff->id],
                [
                    'incident_id' => $incident?->id,
                    'action_status' => $validated['action_status'],
                    'latitude' => $validated['latitude'],
                    'longitude' => $validated['longitude'],
                    'accuracy' => $validated['accuracy'] ?? null,
                    'heading' => $validated['heading'] ?? null,
                    'battery_level' => $validated['battery_level'] ?? null,
                    'metadata' => [
                        'source' => 'staff_portal',
                        'user_agent' => request()->userAgent(),
                    ],
                    'recorded_at' => now(),
                ]
            );

            ResponderStatusLog::query()->create([
                'responder_id' => $staff->id,
                'incident_id' => $incident?->id,
                'action_status' => $validated['action_status'],
                'notes' => $notes !== '' ? $notes : null,
                'latitude' => $validated['latitude'],
                'longitude' => $validated['longitude'],
                'metadata' => [
                    'source' => 'staff_portal',
                ],
            ]);

            $this->syncIncidentProgression($incident, $staff, $validated['action_status'], $notes);

            return $location;
        });

        $commandCenter->clear();

        $location->load([
            'responder:id,full_name,email,phone,barangay,role,status',
            'incident:id,reference_code,type,status,address_label,latitude,longitude',
        ]);

        return $this->successResponse([
            'location' => (new ResponderLocationResource($location))->resolve(),
        ], 'Responder location and action status updated successfully.');
    }

    public function storeRoutePoint(StoreRoutePointRequest $request)
    {
        $staff = $request->user();
        $validated = $request->validated();

        $incident = Incident::query()
            ->where('id', $validated['incident_id'])
            ->whereHas('assignments', function (Builder $query) use ($staff): void {
                $query->where('staff_id', $staff->id);
            })
            ->first();

        if (! $incident) {
            return $this->errorResponse('Assigned incident not found.', [], 404);
        }

        $point = ResponderRoutePoint::query()->create([
            'responder_id' => $staff->id,
            'incident_id' => $incident->id,
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'accuracy' => $validated['accuracy'] ?? null,
            'heading' => $validated['heading'] ?? null,
            'action_status' => $validated['action_status'] ?? 'on_the_way',
            'recorded_at' => now(),
        ]);

        return $this->successResponse([
            'point' => [
                'id' => $point->id,
                'latitude' => (float) $point->latitude,
                'longitude' => (float) $point->longitude,
                'recorded_at' => $point->recorded_at->toIso8601String(),
            ],
        ], 'Route point recorded successfully.');
    }

    public function storeHealthLog(StoreHealthLogRequest $request)
    {
        $staff = $request->user();
        $validated = $request->validated();

        $log = ResponderHealthLog::query()->create([
            'responder_id' => $staff->id,
            'incident_id' => $validated['incident_id'] ?? null,
            'event_type' => $validated['event_type'],
            'severity' => $validated['severity'],
            'payload' => $validated['payload'] ?? null,
            'recorded_at' => $validated['recorded_at'] ?? now(),
        ]);

        return $this->successResponse([
            'log' => [
                'id' => $log->id,
                'event_type' => $log->event_type,
                'severity' => $log->severity,
                'recorded_at' => $log->recorded_at->toIso8601String(),
            ],
        ], 'Health log recorded successfully.');
    }

    private function syncIncidentProgression(?Incident $incident, mixed $staff, string $actionStatus, string $notes): void
    {
        if (! $incident) {
            return;
        }

        $targetStatus = self::ACTION_TO_INCIDENT_STATUS[$actionStatus] ?? null;

        if (! $targetStatus) {
            return;
        }

        $expectedStatus = IncidentStatusProgression::expectedNextStatus((string) $incident->status);

        if ($expectedStatus !== $targetStatus) {
            return;
        }

        $progressNotes = $notes !== ''
            ? $notes
            : str_replace('_', ' ', $actionStatus);

        IncidentStatusProgression::progress($incident, $staff, $targetStatus, $progressNotes);
    }
}

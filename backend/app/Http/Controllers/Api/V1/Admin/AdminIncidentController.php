<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Events\IncidentAssignedToStaff;
use App\Events\IncidentStatusUpdated;
use App\Events\IncidentVerificationUpdated;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\RejectIncidentRequest;
use App\Http\Requests\Admin\VerifyIncidentRequest;
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
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class AdminIncidentController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'status' => ['nullable', 'in:pending_verification,verified,rejected,under_assessment,responding,resolved'],
            'type' => ['nullable', 'in:fire,medical,crime,flood,accident,other'],
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'search' => ['nullable', 'string', 'max:255'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'lite' => ['nullable', 'boolean'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $validated = $validator->validated();
        $lite = $request->boolean('lite');
        $page = max(1, (int) $request->query('page', 1));
        $perPage = (int) ($validated['per_page'] ?? 15);
        $cacheKey = 'admin.incidents.index.v5.'.md5(json_encode([
            'filters' => $validated,
            'lite' => $lite,
            'page' => $page,
            'per_page' => $perPage,
        ]));

        $payload = Cache::remember($cacheKey, now()->addSeconds(8), function () use ($validated, $lite, $perPage): array {
            if ($lite) {
                $query = Incident::query()
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
                    ])
                    ->with([
                        'reporter:id,full_name,barangay',
                        'latestAssignment.staff:id,full_name,barangay,role,status',
                    ])
                    ->orderByDesc('created_at');
            } else {
                $query = Incident::query()
                    ->select([
                        'id',
                        'reference_code',
                        'reporter_id',
                        'is_guest',
                        'type',
                        'description',
                        'incident_datetime',
                        'latitude',
                        'longitude',
                        'address_label',
                        'status',
                        'is_iot_generated',
                        'device_id',
                        'rejection_reason',
                        'resolved_at',
                        'created_at',
                        'updated_at',
                    ])
                    ->with([
                        'reporter:id,full_name,email,phone,barangay,address,role,status',
                        'media',
                        'latestAssignment.staff:id,full_name,email,phone,barangay,role,status',
                    ])
                    ->orderByDesc('created_at');
            }

            $this->applyIncidentFilters($query, $validated);

            $incidents = $query->paginate($perPage)->withQueryString();
            $incidents->getCollection()->transform(
                fn (Incident $incident) => (new IncidentSummaryResource($incident))->resolve()
            );

            return [
                'incidents' => $incidents->toArray(),
            ];
        });

        return $this->successResponse($payload, 'Admin incidents retrieved successfully.');
    }

    public function map(Request $request)
    {
        $payload = $request->all();

        if (array_key_exists('today_only', $payload)) {
            $payload['today_only'] = $this->normalizeNullableBoolean($payload['today_only']);
        }

        $validator = Validator::make($payload, [
            'status' => ['nullable', 'in:pending_verification,verified,rejected,under_assessment,responding,resolved'],
            'type' => ['nullable', 'in:fire,medical,crime,flood,accident,other'],
            'types' => ['nullable', 'array'],
            'types.*' => ['in:fire,medical,crime,flood,accident,other'],
            'date' => ['nullable', 'date_format:Y-m-d'],
            'today_only' => ['nullable', 'boolean'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $validated = $validator->validated();
        $cacheKey = 'admin.incidents.map.v3.'.md5(json_encode($validated));

        $incidents = Cache::remember($cacheKey, now()->addSeconds(10), function () use ($validated): array {
            $query = Incident::query()
                ->with(['reporter:id,full_name', 'latestAssignment.staff:id,full_name'])
                ->orderByDesc('created_at');

            if (! empty($validated['status'])) {
                $query->where('status', $validated['status']);
            } else {
                // Keep the default map view focused on active work.
                $query->where('status', '!=', 'resolved');
            }

            if (! empty($validated['type'])) {
                $query->where('type', $validated['type']);
            }

            if (! empty($validated['types'])) {
                $query->whereIn('type', $validated['types']);
            }

            if (! empty($validated['date'])) {
                $day = Carbon::parse($validated['date']);
                $query->whereBetween('created_at', [$day->copy()->startOfDay(), $day->copy()->endOfDay()]);
            }

            if (($validated['today_only'] ?? false) === true) {
                $query->whereBetween('created_at', [now()->startOfDay(), now()->endOfDay()]);
            }

            $incidents = $query->limit(500)->get([
                'id',
                'reference_code',
                'type',
                'status',
                'latitude',
                'longitude',
                'address_label',
                'description',
                'reporter_id',
                'is_guest',
                'is_iot_generated',
                'device_id',
                'incident_datetime',
                'created_at',
            ]);

            return IncidentSummaryResource::collection($incidents)->resolve();
        });

        return $this->successResponse([
            'incidents' => $incidents,
        ], 'Map incidents retrieved successfully.');
    }

    public function triageBoard()
    {
        $payload = Cache::remember('admin.triage_board.v3', now()->addSeconds(10), function (): array {
            $statusLimits = [
                'pending_verification' => 50,
                'verified' => 50,
                'under_assessment' => 50,
                'responding' => 50,
                'resolved' => 30,
            ];

            $rankedIds = DB::table('incidents')
                ->select([
                    'id',
                    'status',
                    DB::raw('ROW_NUMBER() OVER (PARTITION BY status ORDER BY created_at DESC) as status_rank'),
                ])
                ->whereIn('status', array_keys($statusLimits));

            $orderedIds = DB::query()
                ->fromSub($rankedIds, 'ranked_incidents')
                ->where(function ($query) use ($statusLimits): void {
                    foreach ($statusLimits as $status => $limit) {
                        $query->orWhere(function ($statusQuery) use ($status, $limit): void {
                            $statusQuery
                                ->where('status', $status)
                                ->where('status_rank', '<=', $limit);
                        });
                    }
                })
                ->orderByRaw("CASE status
                    WHEN 'pending_verification' THEN 1
                    WHEN 'verified' THEN 2
                    WHEN 'under_assessment' THEN 3
                    WHEN 'responding' THEN 4
                    WHEN 'resolved' THEN 5
                    ELSE 6
                END")
                ->orderBy('status_rank')
                ->pluck('id');

            if ($orderedIds->isEmpty()) {
                return [
                    'incidents' => [
                        'data' => [],
                    ],
                ];
            }

            $incidentsById = Incident::query()
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
                    'created_at',
                ])
                ->with([
                    'reporter:id,full_name,barangay',
                    'latestAssignment.staff:id,full_name,barangay,role,status',
                ])
                ->whereIn('id', $orderedIds->all())
                ->get()
                ->keyBy('id');

            $incidents = $orderedIds
                ->map(fn ($id) => $incidentsById->get($id))
                ->filter()
                ->values();

            return [
                'incidents' => [
                    'data' => IncidentSummaryResource::collection($incidents)->resolve(),
                ],
            ];
        });

        return $this->successResponse($payload, 'Triage board incidents retrieved successfully.');
    }

    public function show(Incident $incident)
    {
        $incident->load([
            'reporter:id,full_name,email,phone,barangay,address,role,status',
            'media',
            'assignments.staff:id,full_name,email,phone,barangay,role,status',
            'assignments.assignedBy:id,full_name,role',
            'logs.changedByUser:id,full_name,role',
        ]);

        $relatedIncidents = $this->findRelatedIncidents($incident);

        return $this->successResponse([
            'incident' => (new IncidentDetailResource($incident))->resolve(),
            'related_incidents' => $relatedIncidents,
        ], 'Admin incident detail retrieved successfully.');
    }

    public function verify(VerifyIncidentRequest $request, Incident $incident, CommandCenterService $commandCenter)
    {
        if ($incident->status !== 'pending_verification') {
            return $this->errorResponse(
                'Only pending incidents can be verified.',
                ['status' => ['Incident is no longer pending verification.']],
                422
            );
        }

        $staff = User::query()
            ->where('id', $request->validated('assigned_staff_id'))
            ->where('role', 'staff')
            ->where('status', 'verified')
            ->first();

        if (! $staff) {
            return $this->errorResponse(
                'Assigned staff is invalid.',
                ['assigned_staff_id' => ['Selected user is not a verified staff member.']],
                422
            );
        }

        $before = $this->incidentAuditSnapshot($incident);

        DB::transaction(function () use ($incident, $request, $staff): void {
            $oldStatus = $incident->status;

            $incident->update([
                'status' => 'verified',
                'rejection_reason' => null,
            ]);

            $incident->assignments()->create([
                'staff_id' => $staff->id,
                'assigned_by' => $request->user()->id,
                'assigned_at' => now(),
            ]);

            $incident->logs()->create([
                'changed_by' => $request->user()->id,
                'old_status' => $oldStatus,
                'new_status' => 'verified',
                'notes' => "Incident verified and assigned to {$staff->full_name}.",
            ]);
        });

        $incident->load([
            'reporter:id,full_name,email,phone,barangay,address,role,status',
            'media',
            'assignments.staff:id,full_name,email,phone,barangay,role,status',
            'assignments.assignedBy:id,full_name,role',
            'logs.changedByUser:id,full_name,role',
        ]);

        event(IncidentAssignedToStaff::fromIncident($incident, $staff));

        if ($incident->reporter_id) {
            event(IncidentVerificationUpdated::forUser(
                $incident->reporter_id,
                $incident,
                "Your report #{$incident->id} has been verified and assigned."
            ));
        }

        AuditLogger::record(
            $request->user(),
            'incident.verify',
            $incident,
            $before,
            $this->incidentAuditSnapshot($incident),
            $incident,
            [
                'assigned_staff_id' => $staff->id,
                'assigned_staff_name' => $staff->full_name,
            ],
        );

        $commandCenter->clear();

        return $this->successResponse([
            'incident' => (new IncidentDetailResource($incident))->resolve(),
        ], 'Incident verified and assigned successfully.');
    }

    public function reject(RejectIncidentRequest $request, Incident $incident, CommandCenterService $commandCenter)
    {
        if ($incident->status !== 'pending_verification') {
            return $this->errorResponse(
                'Only pending incidents can be rejected.',
                ['status' => ['Incident is no longer pending verification.']],
                422
            );
        }

        $reason = $request->validated('rejection_reason');
        $before = $this->incidentAuditSnapshot($incident);

        DB::transaction(function () use ($incident, $request, $reason): void {
            $oldStatus = $incident->status;

            $incident->update([
                'status' => 'rejected',
                'rejection_reason' => $reason,
            ]);

            $incident->logs()->create([
                'changed_by' => $request->user()->id,
                'old_status' => $oldStatus,
                'new_status' => 'rejected',
                'notes' => $reason,
            ]);
        });

        $incident->load([
            'reporter:id,full_name,email,phone,barangay,address,role,status',
            'media',
            'assignments.staff:id,full_name,email,phone,barangay,role,status',
            'assignments.assignedBy:id,full_name,role',
            'logs.changedByUser:id,full_name,role',
        ]);

        if ($incident->reporter_id) {
            event(IncidentVerificationUpdated::forUser(
                $incident->reporter_id,
                $incident,
                "Your report #{$incident->id} was rejected. Reason: {$reason}"
            ));
        }

        AuditLogger::record(
            $request->user(),
            'incident.reject',
            $incident,
            $before,
            $this->incidentAuditSnapshot($incident),
            $incident,
            [
                'rejection_reason' => $reason,
            ],
        );

        $commandCenter->clear();

        return $this->successResponse([
            'incident' => (new IncidentDetailResource($incident))->resolve(),
        ], 'Incident rejected successfully.');
    }

    public function updateStatus(UpdateStaffIncidentStatusRequest $request, string $incidentId, CommandCenterService $commandCenter)
    {
        $admin = $request->user();
        $validated = $request->validated();
        $newStatus = $validated['status'];
        $notes = trim((string) $validated['notes']);
        $beforeIncident = Incident::query()
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
            $admin,
            $newStatus,
            $notes,
            $unitsCoordinated
        ): array {
            $incident = Incident::query()
                ->lockForUpdate()
                ->find($incidentId);

            if (! $incident) {
                return ['error' => 'not_found'];
            }

            return IncidentStatusProgression::progress(
                $incident,
                $admin,
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

        $incident = Incident::query()
            ->with([
                'reporter:id,full_name,email,phone,barangay,address,role,status',
                'media',
                'assignments.staff:id,full_name,email,phone,barangay,role,status',
                'assignments.assignedBy:id,full_name,role',
                'logs.changedByUser:id,full_name,role',
            ])
            ->find($updateContext['incident_id']);

        event(new IncidentStatusUpdated(
            $incident,
            $admin,
            $updateContext['old_status'],
            $updateContext['new_status'],
            $notes
        ));

        if ($updateContext['new_status'] === 'resolved' && $incident?->reporter_id) {
            event(IncidentVerificationUpdated::forUser(
                $incident->reporter_id,
                $incident,
                "Your incident #{$incident->id} has been resolved."
            ));
        }

        if ($incident) {
            AuditLogger::record(
                $admin,
                'incident.status_update',
                $incident,
                $before,
                $this->incidentAuditSnapshot($incident),
                $incident,
                [
                    'old_status' => $updateContext['old_status'],
                    'new_status' => $updateContext['new_status'],
                    'notes' => $notes,
                    'units_coordinated' => $unitsCoordinated,
                ],
            );
        }

        $commandCenter->clear();

        return $this->successResponse([
            'incident' => $incident ? (new IncidentDetailResource($incident))->resolve() : null,
        ], 'Incident status updated successfully.');
    }

    public function staff(CommandCenterService $commandCenter)
    {
        return $this->successResponse([
            'staff' => $commandCenter->verifiedStaff(),
        ], 'Staff list retrieved successfully.');
    }

    public function kpis(CommandCenterService $commandCenter)
    {
        return $this->successResponse($commandCenter->kpis(), 'KPI data retrieved successfully.');
    }

    private function applyIncidentFilters(Builder $query, array $validated): void
    {
        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        if (! empty($validated['type'])) {
            $query->where('type', $validated['type']);
        }

        if (! empty($validated['from_date'])) {
            $query->where('created_at', '>=', Carbon::parse($validated['from_date'])->startOfDay());
        }

        if (! empty($validated['to_date'])) {
            $query->where('created_at', '<=', Carbon::parse($validated['to_date'])->endOfDay());
        }

        if (! empty($validated['search'])) {
            $search = trim((string) $validated['search']);
            $like = DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
            $pattern = "%{$search}%";

            $query->where(function (Builder $nestedQuery) use ($like, $pattern): void {
                if (DB::connection()->getDriverName() === 'pgsql') {
                    $nestedQuery->whereRaw('incidents.id::text ILIKE ?', [$pattern]);
                } else {
                    $nestedQuery->where('incidents.id', 'like', $pattern);
                }

                $nestedQuery
                    ->orWhere('reference_code', $like, $pattern)
                    ->orWhereHas('reporter', function (Builder $reporterQuery) use ($like, $pattern): void {
                        $reporterQuery->where('full_name', $like, $pattern);
                    });
            });
        }
    }

    private function findRelatedIncidents(Incident $incident): array
    {
        $originDateTime = $incident->incident_datetime ?? $incident->created_at;

        if (! $originDateTime) {
            return [];
        }

        $originLat = (float) $incident->latitude;
        $originLng = (float) $incident->longitude;
        $minutesWindow = 60;
        $radiusMeters = 100;

        $windowStart = $originDateTime->copy()->subMinutes($minutesWindow);
        $windowEnd = $originDateTime->copy()->addMinutes($minutesWindow);

        $candidates = Incident::query()
            ->with([
                'reporter:id,full_name',
                'assignments.staff:id,full_name',
            ])
            ->where('id', '!=', $incident->id)
            ->whereBetween('incident_datetime', [$windowStart, $windowEnd])
            ->orderByDesc('created_at')
            ->limit(50)
            ->get([
                'id',
                'reference_code',
                'type',
                'status',
                'reporter_id',
                'is_guest',
                'latitude',
                'longitude',
                'created_at',
            ]);

        return $candidates
            ->map(function (Incident $candidate) use ($originLat, $originLng, $radiusMeters): ?array {
                $distanceMeters = $this->calculateDistanceInMeters(
                    $originLat,
                    $originLng,
                    (float) $candidate->latitude,
                    (float) $candidate->longitude
                );

                if ($distanceMeters > $radiusMeters) {
                    return null;
                }

                $assignedResponder = $candidate->assignments->first()?->staff?->full_name;

                return [
                    'id' => $candidate->id,
                    'reference_code' => $candidate->reference_code,
                    'type' => $candidate->type,
                    'status' => $candidate->status,
                    'created_at' => $candidate->created_at?->toIso8601String(),
                    'distance_meters' => (int) round($distanceMeters),
                    'reporter' => $candidate->reporter ? [
                        'id' => $candidate->reporter->id,
                        'full_name' => $candidate->reporter->full_name,
                    ] : null,
                    'assigned_responder' => $assignedResponder,
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    private function calculateDistanceInMeters(
        float $lat1,
        float $lng1,
        float $lat2,
        float $lng2
    ): float {
        $earthRadius = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);

        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2))
            * sin($dLng / 2) ** 2;

        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $earthRadius * $c;
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
                ->filter(fn (array $staff) => ! empty($staff['id']))
                ->values()
                ->all(),
        ];
    }

    private function normalizeNullableBoolean(mixed $value): mixed
    {
        if ($value === null || is_bool($value)) {
            return $value;
        }

        if (is_string($value)) {
            return match (strtolower(trim($value))) {
                '1', 'true', 'on', 'yes' => true,
                '0', 'false', 'off', 'no' => false,
                default => $value,
            };
        }

        return $value;
    }
}

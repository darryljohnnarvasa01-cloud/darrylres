<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Volunteer\AcceptVolunteerMissionRequest;
use App\Http\Requests\Volunteer\NearbyVolunteersRequest;
use App\Http\Requests\Volunteer\RegisterVolunteerRequest;
use App\Http\Resources\Api\V1\IncidentSummaryResource;
use App\Models\Incident;
use App\Models\ResponderLocation;
use App\Models\User;
use App\Support\ApiResponse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class VolunteerController extends Controller
{
    use ApiResponse;

    private const ACTIVE_INCIDENT_STATUSES = [
        'verified',
        'under_assessment',
        'responding',
    ];

    public function register(RegisterVolunteerRequest $request)
    {
        $user = $request->user();
        $validated = $request->validated();
        $skills = collect($validated['volunteer_skills'])
            ->map(fn (string $skill): string => strtolower(trim($skill)))
            ->unique()
            ->values()
            ->all();

        DB::transaction(function () use ($request, $user, $validated, $skills): void {
            $user->forceFill([
                'is_volunteer' => true,
                'volunteer_skills' => $skills,
                'volunteer_availability' => (bool) ($validated['volunteer_availability'] ?? true),
            ])->save();

            if (isset($validated['latitude'], $validated['longitude'])) {
                ResponderLocation::query()->updateOrCreate(
                    ['responder_id' => $user->id],
                    [
                        'incident_id' => null,
                        'action_status' => 'cancelled',
                        'latitude' => $validated['latitude'],
                        'longitude' => $validated['longitude'],
                        'accuracy' => $validated['accuracy'] ?? null,
                        'heading' => null,
                        'battery_level' => null,
                        'metadata' => [
                            'source' => 'volunteer_dashboard',
                            'availability' => (bool) ($validated['volunteer_availability'] ?? true),
                            'user_agent' => $request->userAgent(),
                        ],
                        'recorded_at' => now(),
                    ]
                );
            }
        });

        $user->refresh();

        return $this->successResponse([
            'volunteer' => $this->volunteerPayload($user),
        ], 'Volunteer profile saved successfully.');
    }

    public function nearby(NearbyVolunteersRequest $request)
    {
        $validated = $request->validated();
        $originLat = (float) $validated['lat'];
        $originLng = (float) $validated['lng'];
        $incidentType = $validated['type'] ?? null;

        $locations = ResponderLocation::query()
            ->with('responder:id,full_name,email,phone,barangay,role,status,is_volunteer,volunteer_skills,volunteer_availability')
            ->whereHas('responder', function (Builder $query): void {
                $query
                    ->where('role', 'citizen')
                    ->where('status', 'verified')
                    ->where('is_volunteer', true)
                    ->where('volunteer_availability', true);
            })
            ->orderByDesc('recorded_at')
            ->limit(250)
            ->get();

        $volunteers = $locations
            ->map(function (ResponderLocation $location) use ($originLat, $originLng, $incidentType): ?array {
                $volunteer = $location->responder;

                if (! $volunteer) {
                    return null;
                }

                $skills = is_array($volunteer->volunteer_skills) ? $volunteer->volunteer_skills : [];

                if ($incidentType && ! in_array($incidentType, $skills, true) && ! in_array('other', $skills, true)) {
                    return null;
                }

                $distanceMeters = $this->calculateDistanceInMeters(
                    $originLat,
                    $originLng,
                    (float) $location->latitude,
                    (float) $location->longitude
                );

                if ($distanceMeters > 5000) {
                    return null;
                }

                return [
                    ...$this->volunteerPayload($volunteer),
                    'distance_meters' => (int) round($distanceMeters),
                    'last_location' => [
                        'latitude' => (float) $location->latitude,
                        'longitude' => (float) $location->longitude,
                        'recorded_at' => $location->recorded_at?->toIso8601String(),
                    ],
                ];
            })
            ->filter()
            ->sortBy('distance_meters')
            ->values()
            ->all();

        return $this->successResponse([
            'volunteers' => $volunteers,
        ], 'Nearby volunteers retrieved successfully.');
    }

    public function acceptMission(AcceptVolunteerMissionRequest $request, Incident $incident)
    {
        $user = $request->user();

        if (! $user->is_volunteer || ! $user->volunteer_availability) {
            return $this->errorResponse('Volunteer registration and availability are required before accepting a mission.', [], 403);
        }

        if (! in_array($incident->status, self::ACTIVE_INCIDENT_STATUSES, true)) {
            return $this->errorResponse('Only verified active incidents can be accepted by volunteers.', [
                'status' => ['Incident is not ready for volunteer dispatch.'],
            ], 422);
        }

        $validated = $request->validated();

        $assignment = DB::transaction(function () use ($request, $user, $incident, $validated) {
            $assignment = $incident->assignments()
                ->where('staff_id', $user->id)
                ->where('is_volunteer', true)
                ->first();

            if (! $assignment) {
                $assignment = $incident->assignments()->create([
                    'staff_id' => $user->id,
                    'assigned_by' => null,
                    'assigned_at' => now(),
                    'is_volunteer' => true,
                ]);

                $incident->logs()->create([
                    'changed_by' => $user->id,
                    'old_status' => $incident->status,
                    'new_status' => $incident->status,
                    'notes' => "Volunteer {$user->full_name} accepted mission support.",
                    'units_coordinated' => ['Community volunteer'],
                ]);
            }

            if (isset($validated['latitude'], $validated['longitude'])) {
                ResponderLocation::query()->updateOrCreate(
                    ['responder_id' => $user->id],
                    [
                        'incident_id' => $incident->id,
                        'action_status' => 'accepted_request',
                        'latitude' => $validated['latitude'],
                        'longitude' => $validated['longitude'],
                        'accuracy' => $validated['accuracy'] ?? null,
                        'heading' => null,
                        'battery_level' => null,
                        'metadata' => [
                            'source' => 'volunteer_dashboard',
                            'user_agent' => $request->userAgent(),
                        ],
                        'recorded_at' => now(),
                    ]
                );
            }

            return $assignment;
        });

        $assignment->load('staff:id,full_name,email,phone,barangay,role,status,is_volunteer');
        $incident->load([
            'reporter:id,full_name,email,phone,barangay,address,role,status',
            'latestAssignment.staff:id,full_name,email,phone,barangay,role,status,is_volunteer',
        ]);

        Cache::forget('admin.triage_board.v3');
        Cache::forget('admin.command_center.snapshot.v4');

        return $this->successResponse([
            'assignment' => [
                'id' => $assignment->id,
                'is_volunteer' => (bool) $assignment->is_volunteer,
                'assigned_at' => $assignment->assigned_at?->toIso8601String(),
                'staff' => $assignment->staff ? [
                    'id' => $assignment->staff->id,
                    'full_name' => $assignment->staff->full_name,
                    'email' => $assignment->staff->email,
                    'phone' => $assignment->staff->phone,
                    'barangay' => $assignment->staff->barangay,
                    'role' => $assignment->staff->role,
                    'status' => $assignment->staff->status,
                    'is_volunteer' => (bool) $assignment->staff->is_volunteer,
                ] : null,
            ],
            'incident' => (new IncidentSummaryResource($incident))->resolve(),
        ], 'Volunteer mission accepted successfully.');
    }

    /**
     * @return array<string, mixed>
     */
    private function volunteerPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'full_name' => $user->full_name,
            'email' => $user->email,
            'phone' => $user->phone,
            'barangay' => $user->barangay,
            'is_volunteer' => (bool) $user->is_volunteer,
            'volunteer_skills' => is_array($user->volunteer_skills) ? $user->volunteer_skills : [],
            'volunteer_availability' => (bool) $user->volunteer_availability,
        ];
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
}

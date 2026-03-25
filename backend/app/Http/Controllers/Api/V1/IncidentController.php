<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\NewIncidentSubmitted;
use App\Http\Controllers\Controller;
use App\Http\Requests\Incident\StoreIncidentRequest;
use App\Models\Incident;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class IncidentController extends Controller
{
    use ApiResponse;

    public function store(StoreIncidentRequest $request)
    {
        $validated = $request->validated();
        $forceSubmit = $request->boolean('force_submit');

        if (! $forceSubmit) {
            $duplicate = $this->findDuplicateIncident(
                (string) $validated['type'],
                (float) $validated['latitude'],
                (float) $validated['longitude']
            );

            if ($duplicate) {
                $minutesAgo = max(1, now()->diffInMinutes($duplicate->incident_datetime));

                return response()->json([
                    'success' => false,
                    'duplicate' => true,
                    'message' => "A similar report was already submitted nearby ({$minutesAgo} mins ago).",
                    'data' => [
                        'existing_incident_id' => $duplicate->id,
                        'minutes_ago' => $minutesAgo,
                    ],
                    'errors' => (object) [],
                ], 409);
            }
        }

        $incident = DB::transaction(function () use ($request, $validated) {
            $incident = Incident::query()->create([
                'reporter_id' => $request->user()->id,
                'type' => $validated['type'],
                'description' => $validated['description'],
                'incident_datetime' => Carbon::parse($validated['incident_datetime']),
                'latitude' => $validated['latitude'],
                'longitude' => $validated['longitude'],
                'address_label' => $validated['address_label'],
                'status' => 'pending_verification',
                'is_iot_generated' => false,
            ]);

            foreach ($request->file('media', []) as $mediaFile) {
                $storedPath = $mediaFile->store("incidents/{$incident->id}", 'public');
                $mimeType = (string) $mediaFile->getMimeType();
                $fileType = str_starts_with($mimeType, 'video/') ? 'video' : 'image';

                $incident->media()->create([
                    'file_path' => $storedPath,
                    'file_type' => $fileType,
                ]);
            }

            $incident->logs()->create([
                'changed_by' => $request->user()->id,
                'old_status' => null,
                'new_status' => 'pending_verification',
                'notes' => 'Incident submitted by citizen.',
            ]);

            return $incident;
        });

        $incident->load([
            'reporter:id,full_name,email,phone,barangay,address,role,status',
            'media',
            'logs.changedByUser:id,full_name,role',
        ]);

        event(new NewIncidentSubmitted($incident));

        return $this->successResponse([
            'incident' => $incident,
        ], 'Incident submitted successfully.', 201);
    }

    public function mine(Request $request)
    {
        $incidents = Incident::query()
            ->with([
                'media',
                'logs.changedByUser:id,full_name,role',
            ])
            ->where('reporter_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->paginate(10);

        return $this->successResponse([
            'incidents' => $incidents,
        ], 'Your incidents retrieved successfully.');
    }

    public function show(Request $request, Incident $incident)
    {
        $incident->load([
            'reporter:id,full_name,email,phone,barangay,address,role,status',
            'media',
            'logs.changedByUser:id,full_name,role',
        ]);

        $user = $request->user();

        if ($user->role === 'citizen' && $incident->reporter_id !== $user->id) {
            return $this->errorResponse('You are not allowed to view this incident.', [], 403);
        }

        return $this->successResponse([
            'incident' => $incident,
        ], 'Incident detail retrieved successfully.');
    }

    private function findDuplicateIncident(string $type, float $latitude, float $longitude): ?Incident
    {
        $windowStart = now()->subMinutes(30);
        $now = now();

        $candidates = Incident::query()
            ->where('type', $type)
            ->whereBetween('incident_datetime', [$windowStart, $now])
            ->orderByDesc('incident_datetime')
            ->get([
                'id',
                'latitude',
                'longitude',
                'incident_datetime',
            ]);

        foreach ($candidates as $candidate) {
            $distanceMeters = $this->calculateDistanceInMeters(
                $latitude,
                $longitude,
                (float) $candidate->latitude,
                (float) $candidate->longitude
            );

            if ($distanceMeters <= 100) {
                return $candidate;
            }
        }

        return null;
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

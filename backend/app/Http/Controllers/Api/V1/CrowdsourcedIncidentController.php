<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Incident\StoreIncidentConfirmationRequest;
use App\Models\Incident;
use App\Models\IncidentConfirmation;
use App\Support\ApiResponse;
use Illuminate\Support\Facades\DB;

class CrowdsourcedIncidentController extends Controller
{
    use ApiResponse;

    private const MAX_DISTANCE_METERS = 1000;

    public function confirm(StoreIncidentConfirmationRequest $request, Incident $incident)
    {
        return $this->submitConfirmation($request, $incident, 'confirm');
    }

    public function dispute(StoreIncidentConfirmationRequest $request, Incident $incident)
    {
        return $this->submitConfirmation($request, $incident, 'dispute');
    }

    private function submitConfirmation(
        StoreIncidentConfirmationRequest $request,
        Incident $incident,
        string $type
    ) {
        $validated = $request->validated();
        $distance = $this->haversineDistanceMeters(
            (float) $incident->latitude,
            (float) $incident->longitude,
            (float) $validated['latitude'],
            (float) $validated['longitude']
        );

        if ($distance > self::MAX_DISTANCE_METERS) {
            return $this->errorResponse(
                'You must be within 1 km of the incident location to confirm or dispute it.',
                ['location' => ['Too far from incident location.']],
                403
            );
        }

        $user = $request->user();
        $guestIdentifier = $request->header('X-RescueLink-Guest-Id');

        if ($user) {
            $existing = IncidentConfirmation::query()
                ->where('incident_id', $incident->id)
                ->where('user_id', $user->id)
                ->first();
        } elseif ($guestIdentifier) {
            $existing = IncidentConfirmation::query()
                ->where('incident_id', $incident->id)
                ->where('guest_identifier', $guestIdentifier)
                ->first();
        } else {
            return $this->errorResponse(
                'Authentication or guest identifier required.',
                [],
                401
            );
        }

        if ($existing) {
            if ($existing->type === $type) {
                return $this->successResponse([
                    'confirmations_count' => $incident->confirmations_count,
                    'disputes_count' => $incident->disputes_count,
                ], "You have already {$type}ed this incident.");
            }

            DB::transaction(function () use ($existing, $incident, $type): void {
                $oldType = $existing->type;
                $existing->update(['type' => $type]);

                if ($oldType === 'confirm') {
                    $incident->decrement('confirmations_count');
                } else {
                    $incident->decrement('disputes_count');
                }

                if ($type === 'confirm') {
                    $incident->increment('confirmations_count');
                } else {
                    $incident->increment('disputes_count');
                }
            });

            return $this->successResponse([
                'confirmations_count' => $incident->fresh()->confirmations_count,
                'disputes_count' => $incident->fresh()->disputes_count,
            ], "Your response has been updated to {$type}.");
        }

        DB::transaction(function () use ($incident, $user, $guestIdentifier, $type): void {
            IncidentConfirmation::query()->create([
                'incident_id' => $incident->id,
                'user_id' => $user?->id,
                'guest_identifier' => $user ? null : $guestIdentifier,
                'type' => $type,
                'created_at' => now(),
            ]);

            if ($type === 'confirm') {
                $incident->increment('confirmations_count');
            } else {
                $incident->increment('disputes_count');
            }
        });

        return $this->successResponse([
            'confirmations_count' => $incident->fresh()->confirmations_count,
            'disputes_count' => $incident->fresh()->disputes_count,
        ], "Incident {$type}ed successfully.");
    }

    private function haversineDistanceMeters(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthRadius = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return $earthRadius * (2 * atan2(sqrt($a), sqrt(1 - $a)));
    }
}

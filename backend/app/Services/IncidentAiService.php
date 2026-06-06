<?php

namespace App\Services;

use App\Models\Incident;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class IncidentAiService
{
    private const CLUSTER_RADIUS_METERS = 500;

    private const CLUSTER_WINDOW_MINUTES = 30;

    public function evaluate(Incident $incident): Incident
    {
        $incidentTime = $incident->incident_datetime ?? $incident->created_at ?? now();
        $windowStart = $incidentTime->copy()->subMinutes(self::CLUSTER_WINDOW_MINUTES);
        $windowEnd = $incidentTime->copy()->addMinutes(self::CLUSTER_WINDOW_MINUTES);
        $originLat = (float) $incident->latitude;
        $originLng = (float) $incident->longitude;

        $candidates = Incident::query()
            ->where('id', '!=', $incident->id)
            ->where('type', $incident->type)
            ->whereBetween('incident_datetime', [$windowStart, $windowEnd])
            ->whereNotIn('status', ['rejected', 'resolved'])
            ->get([
                'id',
                'latitude',
                'longitude',
            ]);

        $nearbyCount = $candidates
            ->filter(fn (Incident $candidate): bool => $this->distanceMeters(
                $originLat,
                $originLng,
                (float) $candidate->latitude,
                (float) $candidate->longitude
            ) <= self::CLUSTER_RADIUS_METERS)
            ->count();

        $clusterSize = $nearbyCount + 1;
        $riskScore = $this->riskScoreForCluster($clusterSize, (string) $incident->type);

        DB::transaction(function () use ($incident, $clusterSize, $riskScore): void {
            $freshIncident = Incident::query()
                ->lockForUpdate()
                ->find($incident->id);

            if (! $freshIncident) {
                return;
            }

            $oldStatus = $freshIncident->status;
            $newStatus = $oldStatus;

            if ($riskScore >= 70 && $oldStatus === 'pending_verification') {
                $newStatus = 'under_assessment';
            }

            $freshIncident->forceFill([
                'ai_risk_score' => $riskScore,
                'status' => $newStatus,
            ])->save();

            if ($riskScore >= 70 && $newStatus !== $oldStatus) {
                $freshIncident->logs()->create([
                    'changed_by' => null,
                    'old_status' => $oldStatus,
                    'new_status' => $newStatus,
                    'notes' => 'AI escalation: cluster detected',
                    'units_coordinated' => [
                        'cluster_size' => $clusterSize,
                        'radius_meters' => self::CLUSTER_RADIUS_METERS,
                        'window_minutes' => self::CLUSTER_WINDOW_MINUTES,
                        'ai_risk_score' => $riskScore,
                    ],
                ]);
            }
        });

        $this->clearIncidentCaches();

        return $incident->fresh() ?? $incident;
    }

    private function riskScoreForCluster(int $clusterSize, string $type): int
    {
        $baseScore = match ($type) {
            'fire', 'medical', 'flood' => 35,
            'crime', 'accident' => 30,
            default => 20,
        };

        if ($clusterSize >= 3) {
            return min(100, 70 + (($clusterSize - 3) * 10));
        }

        return min(69, $baseScore + (($clusterSize - 1) * 15));
    }

    private function distanceMeters(
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

    private function clearIncidentCaches(): void
    {
        Cache::forget('admin.triage_board.v3');
        Cache::forget('admin.command_center.snapshot.v4');
        Cache::forget('admin.incident_kpis.v3');
        Cache::forget('public_incidents_map_v2');
        Cache::forget('public_incident_stats_v2');
    }
}

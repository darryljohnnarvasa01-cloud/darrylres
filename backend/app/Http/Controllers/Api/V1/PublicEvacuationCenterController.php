<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\HazardZoneResource;
use App\Models\HazardZone;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

class PublicEvacuationCenterController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $lat = $request->query('lat');
        $lng = $request->query('lng');

        $centers = HazardZone::query()
            ->where('type', 'evacuation')
            ->where('is_active', true)
            ->orderBy('name')
            ->get();

        $centersWithDistance = $centers->map(function ($center) use ($lat, $lng) {
            $distance = null;

            if (is_numeric($lat) && is_numeric($lng)) {
                $distance = $this->haversineDistance((float) $lat, (float) $lng, $center);
            }

            return [
                ...(new HazardZoneResource($center))->resolve(),
                'distance_meters' => $distance !== null ? round($distance) : null,
            ];
        });

        if (is_numeric($lat) && is_numeric($lng)) {
            $centersWithDistance = $centersWithDistance
                ->filter(fn ($c) => $c['distance_meters'] !== null)
                ->sortBy('distance_meters')
                ->values();
        }

        return $this->successResponse([
            'evacuation_centers' => $centersWithDistance->values()->all(),
        ], 'Evacuation centers retrieved successfully.');
    }

    private function haversineDistance(float $lat, float $lng, HazardZone $center): float
    {
        $polygon = $center->polygon ?? [];
        $circle = $polygon['circle'] ?? null;

        if ($circle && isset($circle['lat'], $circle['lng'])) {
            $centerLat = (float) $circle['lat'];
            $centerLng = (float) $circle['lng'];
        } elseif (is_array($polygon) && count($polygon) > 0) {
            $first = $polygon[0] ?? null;
            if (is_array($first) && count($first) >= 2) {
                $centerLat = (float) $first[0];
                $centerLng = (float) $first[1];
            } elseif (is_array($first) && isset($first['lat'], $first['lng'])) {
                $centerLat = (float) $first['lat'];
                $centerLng = (float) $first['lng'];
            } else {
                return 0;
            }
        } else {
            return 0;
        }

        $earthRadius = 6371000;
        $dLat = deg2rad($centerLat - $lat);
        $dLng = deg2rad($centerLng - $lng);
        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat)) * cos(deg2rad($centerLat)) * sin($dLng / 2) ** 2;

        return $earthRadius * (2 * atan2(sqrt($a), sqrt(1 - $a)));
    }
}

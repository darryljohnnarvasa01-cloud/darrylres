<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\HazardZoneResource;
use App\Models\HazardZone;
use App\Support\ApiResponse;
use Illuminate\Support\Facades\Cache;

class PublicHazardZoneController extends Controller
{
    use ApiResponse;

    public function index()
    {
        $zones = Cache::remember('public.hazard_zones.active.v1', 60, function () {
            return HazardZone::query()
                ->where('is_active', true)
                ->orderBy('type')
                ->orderBy('name')
                ->get();
        });

        return $this->successResponse([
            'hazard_zones' => HazardZoneResource::collection($zones)->resolve(),
        ], 'Public hazard zones retrieved successfully.');
    }
}

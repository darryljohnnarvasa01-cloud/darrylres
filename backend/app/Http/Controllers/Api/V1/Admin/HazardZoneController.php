<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\HazardZoneRequest;
use App\Http\Resources\Api\V1\HazardZoneResource;
use App\Models\HazardZone;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class HazardZoneController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $zones = HazardZone::query()
            ->when(! $request->boolean('include_inactive'), fn ($query) => $query->where('is_active', true))
            ->orderBy('type')
            ->orderBy('name')
            ->get();

        return $this->successResponse([
            'hazard_zones' => HazardZoneResource::collection($zones)->resolve(),
        ], 'Hazard zones retrieved successfully.');
    }

    public function store(HazardZoneRequest $request)
    {
        $zone = HazardZone::query()->create([
            ...$request->validated(),
            'is_active' => $request->boolean('is_active', true),
        ]);

        $this->clearHazardCache();

        return $this->successResponse([
            'hazard_zone' => (new HazardZoneResource($zone))->resolve(),
        ], 'Hazard zone created successfully.', 201);
    }

    public function update(HazardZoneRequest $request, HazardZone $hazardZone)
    {
        $payload = $request->validated();

        if ($request->has('is_active')) {
            $payload['is_active'] = $request->boolean('is_active');
        }

        $hazardZone->update($payload);
        $this->clearHazardCache();

        return $this->successResponse([
            'hazard_zone' => (new HazardZoneResource($hazardZone->fresh()))->resolve(),
        ], 'Hazard zone updated successfully.');
    }

    public function destroy(HazardZone $hazardZone)
    {
        $hazardZone->delete();
        $this->clearHazardCache();

        return $this->successResponse([
            'deleted' => true,
        ], 'Hazard zone deleted successfully.');
    }

    private function clearHazardCache(): void
    {
        Cache::forget('public.hazard_zones.active.v1');
    }
}

<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\ResponderHealthLogResource;
use App\Http\Resources\Api\V1\ResponderLocationResource;
use App\Http\Resources\Api\V1\ResponderRoutePointResource;
use App\Models\ResponderHealthLog;
use App\Models\ResponderLocation;
use App\Models\ResponderRoutePoint;
use App\Models\User;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ResponderTrackingController extends Controller
{
    use ApiResponse;

    public function index()
    {
        $locations = ResponderLocation::query()
            ->with([
                'responder:id,full_name,email,phone,barangay,role,status',
                'incident:id,reference_code,type,status,address_label,latitude,longitude',
            ])
            ->orderByDesc('recorded_at')
            ->get();

        return $this->successResponse([
            'locations' => ResponderLocationResource::collection($locations)->resolve(),
        ], 'Responder locations retrieved successfully.');
    }

    public function healthLogs(Request $request, User $responder)
    {
        $validator = Validator::make($request->query(), [
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Invalid pagination parameters.', $validator->errors()->toArray(), 422);
        }

        $page = (int) $request->query('page', 1);
        $perPage = (int) $request->query('per_page', 50);

        $logs = ResponderHealthLog::query()
            ->with([
                'incident:id,reference_code',
            ])
            ->where('responder_id', $responder->id)
            ->orderByDesc('recorded_at')
            ->paginate($perPage, ['*'], 'page', $page);

        return $this->successResponse([
            'logs' => ResponderHealthLogResource::collection($logs->items())->resolve(),
            'pagination' => [
                'current_page' => $logs->currentPage(),
                'last_page' => $logs->lastPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
            ],
        ], 'Health logs retrieved successfully.');
    }

    public function route(Request $request, User $responder)
    {
        $validator = Validator::make($request->query(), [
            'incident_id' => ['required', 'uuid'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Incident ID is required.', $validator->errors()->toArray(), 422);
        }

        $points = ResponderRoutePoint::query()
            ->where('responder_id', $responder->id)
            ->where('incident_id', $request->query('incident_id'))
            ->orderBy('recorded_at')
            ->get();

        return $this->successResponse([
            'points' => ResponderRoutePointResource::collection($points)->resolve(),
        ], 'Route points retrieved successfully.');
    }
}

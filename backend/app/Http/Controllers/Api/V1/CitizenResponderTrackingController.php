<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\IncidentDetailResource;
use App\Http\Resources\Api\V1\ResponderLocationResource;
use App\Http\Resources\Api\V1\ResponderStatusLogResource;
use App\Models\Incident;
use App\Models\ResponderLocation;
use App\Models\ResponderStatusLog;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

class CitizenResponderTrackingController extends Controller
{
    use ApiResponse;

    public function show(Request $request, Incident $incident)
    {
        if ($incident->reporter_id !== $request->user()->id) {
            return $this->errorResponse('Incident not found.', [], 404);
        }

        $incident->load([
            'reporter:id,full_name,email,phone,barangay,address,role,status',
            'media',
            'assignments.staff:id,full_name,email,phone,barangay,role,status',
            'logs.changedByUser:id,full_name,role',
        ]);

        $assignedResponderId = $incident->assignments->first()?->staff_id;
        $location = null;
        $statusLogs = collect();

        if ($assignedResponderId) {
            $location = ResponderLocation::query()
                ->with([
                    'responder:id,full_name,email,phone,barangay,role,status',
                    'incident:id,reference_code,type,status,address_label,latitude,longitude',
                ])
                ->where('responder_id', $assignedResponderId)
                ->first();

            $statusLogs = ResponderStatusLog::query()
                ->with('responder:id,full_name,phone,barangay')
                ->where('incident_id', $incident->id)
                ->where('responder_id', $assignedResponderId)
                ->orderByDesc('created_at')
                ->limit(20)
                ->get();
        }

        return $this->successResponse([
            'incident' => (new IncidentDetailResource($incident))->resolve(),
            'assigned_responder_id' => $assignedResponderId,
            'location' => $location ? (new ResponderLocationResource($location))->resolve() : null,
            'status_logs' => ResponderStatusLogResource::collection($statusLogs)->resolve(),
        ], 'Responder tracking retrieved successfully.');
    }
}

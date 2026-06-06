<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\IncidentSummaryResource;
use App\Models\Incident;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class AiRiskBoardController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $perPage = (int) ($validator->validated()['per_page'] ?? 20);
        $incidents = Incident::query()
            ->select([
                'id',
                'reference_code',
                'reporter_id',
                'is_guest',
                'type',
                'description',
                'latitude',
                'longitude',
                'address_label',
                'status',
                'is_iot_generated',
                'ai_risk_score',
                'incident_datetime',
                'created_at',
                'resolved_at',
            ])
            ->with([
                'reporter:id,full_name,barangay',
                'latestAssignment.staff:id,full_name,barangay,role,status',
            ])
            ->where('ai_risk_score', '>=', 70)
            ->orderByDesc('ai_risk_score')
            ->orderByDesc('created_at')
            ->paginate($perPage);

        $incidents->getCollection()->transform(
            fn (Incident $incident) => (new IncidentSummaryResource($incident))->resolve()
        );

        return $this->successResponse([
            'incidents' => $incidents,
        ], 'AI risk board retrieved successfully.');
    }
}

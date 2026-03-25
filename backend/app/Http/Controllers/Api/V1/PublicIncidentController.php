<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Incident;
use App\Support\ApiResponse;
use App\Support\IncidentVerification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class PublicIncidentController extends Controller
{
    use ApiResponse;

    public function map()
    {
        $incidents = Cache::remember('public_incidents_map_v2', 60, function () {
            return Incident::query()
                ->whereIn('status', ['pending_verification', 'verified', 'under_assessment', 'responding'])
                ->orderByDesc('created_at')
                ->get([
                    'id',
                    'type',
                    'address_label',
                    'status',
                    'created_at',
                    'latitude',
                    'longitude',
                ]);
        });

        return $this->successResponse([
            'incidents' => $incidents,
        ], 'Public incident map data retrieved successfully.');
    }

    public function recent()
    {
        $validator = Validator::make(request()->all(), [
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $limit = (int) ($validator->validated()['limit'] ?? 10);
        $cacheKey = "public_incidents_recent_v2_limit_{$limit}";

        $incidents = Cache::remember($cacheKey, 60, function () use ($limit) {
            return Incident::query()
                ->whereNotIn('status', ['rejected'])
                ->orderByDesc('created_at')
                ->limit($limit)
                ->get([
                    'id',
                    'type',
                    'address_label',
                    'status',
                    'created_at',
                    'latitude',
                    'longitude',
                ]);
        });

        return $this->successResponse([
            'incidents' => $incidents,
        ], 'Public recent incidents retrieved successfully.');
    }

    public function stats()
    {
        $stats = Cache::remember('public_incident_stats_v2', 60, function () {
            $totalReported = Incident::query()->count();
            $totalResolved = Incident::query()->where('status', 'resolved')->count();
            $activeToday = Incident::query()
                ->whereDate('created_at', now()->toDateString())
                ->whereIn('status', ['pending_verification', 'verified', 'under_assessment', 'responding'])
                ->count();

            $rows = DB::table('incidents')
                ->join('incident_logs', function ($join) {
                    $join
                        ->on('incident_logs.incident_id', '=', 'incidents.id')
                        ->whereIn('incident_logs.new_status', ['under_assessment', 'responding', 'resolved']);
                })
                ->select(
                    'incidents.id',
                    'incidents.created_at',
                    DB::raw('MIN(incident_logs.created_at) as first_response_at')
                )
                ->groupBy('incidents.id', 'incidents.created_at')
                ->get();

            $durations = $rows
                ->map(function ($row) {
                    if (! $row->first_response_at) {
                        return null;
                    }

                    $created = Carbon::parse($row->created_at);
                    $firstResponse = Carbon::parse($row->first_response_at);

                    return $created->diffInMinutes($firstResponse) / 60;
                })
                ->filter(fn ($value) => $value !== null)
                ->values();

            $avgResponseHours = $durations->isNotEmpty()
                ? round((float) $durations->avg(), 2)
                : 0;

            return [
                'total_reported' => $totalReported,
                'total_resolved' => $totalResolved,
                'active_today' => $activeToday,
                'avg_response_hours' => $avgResponseHours,
            ];
        });

        return $this->successResponse($stats, 'Public stats retrieved successfully.');
    }

    public function verify(string $incidentCode)
    {
        $normalizedCode = strtoupper(trim($incidentCode));
        $cacheKey = "public_incident_verify_v1_{$normalizedCode}";

        $incident = Cache::remember($cacheKey, 60, function () use ($normalizedCode) {
            return Incident::query()
                ->where('reference_code', $normalizedCode)
                ->first([
                    'id',
                    'reference_code',
                    'type',
                    'status',
                    'address_label',
                    'created_at',
                ]);
        });

        if (! $incident) {
            return $this->errorResponse('Incident verification record not found.', [], 404);
        }

        return $this->successResponse([
            'incident' => [
                'id' => $incident->id,
                'reference_code' => $incident->reference_code,
                'status' => $incident->status,
                'type' => $incident->type,
                'barangay' => IncidentVerification::extractBarangay((string) $incident->address_label),
                'date_filed' => optional($incident->created_at)->toIso8601String(),
                'verification_path' => IncidentVerification::verificationPath((string) $incident->reference_code),
                'verification_url' => IncidentVerification::verificationUrl((string) $incident->reference_code),
                'qr_code_svg' => IncidentVerification::qrCodeSvgDataUri((string) $incident->reference_code),
                'official_seal' => [
                    'name' => 'CDRRMO Valencia City, Bukidnon',
                    'label' => 'Official Verification Seal',
                ],
            ],
        ], 'Public incident verification data retrieved successfully.');
    }
}

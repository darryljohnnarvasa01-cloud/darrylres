<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class AdminStaffPerformanceController extends Controller
{
    use ApiResponse;

    private const RESPONSE_SLA_MINUTES = 15;

    private const RESPONSE_STATUSES = [
        'under_assessment',
        'responding',
        'resolved',
    ];

    private const CLOSED_STATUSES = [
        'resolved',
        'rejected',
    ];

    public function index()
    {
        $generatedAt = now();
        $cacheKey = 'admin.staff_performance.v3';

        if ($cached = Cache::get($cacheKey)) {
            return $this->successResponse($cached, 'Staff performance data retrieved successfully.');
        }

        $staff = DB::table('users')
            ->where('role', 'staff')
            ->orderBy('full_name')
            ->get([
                'id',
                'full_name',
                'role',
                'barangay',
                'status',
                'email',
                'phone',
            ]);

        if ($staff->isEmpty()) {
            $payload = [
                'staff' => [],
                'meta' => $this->buildMeta($generatedAt),
            ];

            Cache::put($cacheKey, $payload, now()->addSeconds(30));

            return $this->successResponse($payload, 'Staff performance data retrieved successfully.');
        }

        $staffIds = $staff->pluck('id')->values();
        $monthTemplate = $this->buildMonthTemplate($generatedAt);
        $monthStart = $generatedAt->copy()->startOfMonth();
        $monthEnd = $generatedAt->copy()->endOfMonth();

        $assignments = DB::table('incident_assignments as assignments')
            ->join('incidents', 'incidents.id', '=', 'assignments.incident_id')
            ->whereIn('assignments.staff_id', $staffIds)
            ->orderByRaw('COALESCE(assignments.assigned_at, assignments.created_at) DESC')
            ->get([
                'assignments.staff_id',
                'assignments.incident_id',
                'assignments.assigned_at',
                'assignments.created_at as assignment_created_at',
                'incidents.reference_code',
                'incidents.type',
                'incidents.status',
                'incidents.address_label',
                'incidents.created_at as incident_created_at',
                'incidents.updated_at as incident_updated_at',
                'incidents.resolved_at as incident_resolved_at',
            ])
            ->unique(fn ($row) => $row->staff_id.'|'.$row->incident_id)
            ->values();

        $incidentIds = $assignments->pluck('incident_id')->unique()->values();

        $logs = $incidentIds->isEmpty()
            ? collect()
            : DB::table('incident_logs')
                ->whereIn('incident_id', $incidentIds)
                ->whereIn('changed_by', $staffIds)
                ->whereIn('new_status', self::RESPONSE_STATUSES)
                ->orderBy('created_at')
                ->get([
                    'incident_id',
                    DB::raw('changed_by as staff_id'),
                    'new_status',
                    'created_at',
                ]);

        $logsByAssignment = $logs->groupBy(fn ($log) => $log->staff_id.'|'.$log->incident_id);

        $metrics = [];

        foreach ($staff as $member) {
            $metrics[$member->id] = [
                'id' => (string) $member->id,
                'full_name' => $member->full_name,
                'role' => $member->role,
                'barangay' => $member->barangay,
                'account_status' => $member->status,
                'email' => $member->email,
                'phone' => $member->phone,
                'incidents_handled_this_month' => 0,
                'total_assignments' => 0,
                'completed_incidents' => 0,
                'current_open_assignments' => 0,
                'avg_response_minutes' => null,
                'avg_resolution_minutes' => null,
                'completion_rate' => 0.0,
                'on_time_rate' => 0.0,
                'recent_incidents' => [],
                'monthly_incident_counts' => [],
                '_month_index' => $monthTemplate,
                '_assigned_incidents' => [],
                '_completed_incidents' => [],
                '_handled_this_month' => [],
                '_on_time_responses' => 0,
                '_response_durations' => [],
                '_resolution_durations' => [],
            ];
        }

        foreach ($assignments as $assignment) {
            $staffId = (string) $assignment->staff_id;

            if (! isset($metrics[$staffId])) {
                continue;
            }

            $metric = &$metrics[$staffId];
            $assignedAt = $this->parseTimestamp(
                $assignment->assigned_at
                ?? $assignment->assignment_created_at
                ?? $assignment->incident_created_at
            );
            $incidentCreatedAt = $this->parseTimestamp($assignment->incident_created_at);
            $incidentUpdatedAt = $this->parseTimestamp($assignment->incident_updated_at);
            $incidentResolvedAt = $this->parseTimestamp($assignment->incident_resolved_at);
            $logKey = $staffId.'|'.$assignment->incident_id;
            $assignmentLogs = collect($logsByAssignment->get($logKey, []));
            $responseLog = $assignmentLogs->first();
            $resolvedLog = $assignmentLogs->firstWhere('new_status', 'resolved');
            $responseAt = $this->parseTimestamp($responseLog->created_at ?? null);
            $resolvedAt = $this->parseTimestamp($resolvedLog->created_at ?? null) ?? $incidentResolvedAt;
            $responseMinutes = $assignedAt && $responseAt
                ? (float) $assignedAt->diffInMinutes($responseAt)
                : null;
            $resolutionMinutes = $assignedAt && $resolvedAt
                ? (float) $assignedAt->diffInMinutes($resolvedAt)
                : null;
            $lastActivityAt = collect([
                $resolvedAt,
                $responseAt,
                $incidentUpdatedAt,
                $assignedAt,
                $incidentCreatedAt,
            ])
                ->filter()
                ->sortByDesc(fn (Carbon $date) => $date->getTimestamp())
                ->first();

            $metric['_assigned_incidents'][$assignment->incident_id] = true;

            if (! in_array($assignment->status, self::CLOSED_STATUSES, true)) {
                $metric['current_open_assignments']++;
            }

            if ($assignment->status === 'resolved' || $resolvedAt) {
                $metric['_completed_incidents'][$assignment->incident_id] = true;
            }

            if ($responseMinutes !== null) {
                $metric['_response_durations'][] = $responseMinutes;

                if ($responseMinutes <= self::RESPONSE_SLA_MINUTES) {
                    $metric['_on_time_responses']++;
                }
            }

            if ($resolutionMinutes !== null) {
                $metric['_resolution_durations'][] = $resolutionMinutes;
            }

            $monthKey = $assignedAt?->format('Y-m');

            if ($monthKey && isset($metric['_month_index'][$monthKey])) {
                $metric['_month_index'][$monthKey]['count']++;
            }

            $wasHandledThisMonth = collect([$assignedAt, $responseAt, $resolvedAt])
                ->filter()
                ->contains(
                    fn (Carbon $date) => $date->betweenIncluded($monthStart, $monthEnd)
                );

            if ($wasHandledThisMonth) {
                $metric['_handled_this_month'][$assignment->incident_id] = true;
            }

            $metric['recent_incidents'][] = [
                'incident_id' => $assignment->incident_id,
                'reference_code' => $assignment->reference_code,
                'type' => $assignment->type,
                'barangay' => $this->extractBarangay((string) $assignment->address_label),
                'status' => $assignment->status,
                'assigned_at' => $assignedAt?->toIso8601String(),
                'submitted_at' => $incidentCreatedAt?->toIso8601String(),
                'response_at' => $responseAt?->toIso8601String(),
                'resolved_at' => $resolvedAt?->toIso8601String(),
                'response_minutes' => $responseMinutes,
                'resolution_minutes' => $resolutionMinutes,
                'last_activity_at' => $lastActivityAt?->toIso8601String(),
            ];

            unset($metric);
        }

        $payload = [];

        foreach ($staff as $member) {
            $metric = $metrics[$member->id];
            $totalAssignments = count($metric['_assigned_incidents']);
            $completedIncidents = count($metric['_completed_incidents']);

            $metric['incidents_handled_this_month'] = count($metric['_handled_this_month']);
            $metric['total_assignments'] = $totalAssignments;
            $metric['completed_incidents'] = $completedIncidents;
            $metric['avg_response_minutes'] = ! empty($metric['_response_durations'])
                ? round(array_sum($metric['_response_durations']) / count($metric['_response_durations']), 1)
                : null;
            $metric['avg_resolution_minutes'] = ! empty($metric['_resolution_durations'])
                ? round(array_sum($metric['_resolution_durations']) / count($metric['_resolution_durations']), 1)
                : null;
            $metric['completion_rate'] = $totalAssignments > 0
                ? round(($completedIncidents / $totalAssignments) * 100, 1)
                : 0.0;
            $metric['on_time_rate'] = $totalAssignments > 0
                ? round(($metric['_on_time_responses'] / $totalAssignments) * 100, 1)
                : 0.0;
            $metric['recent_incidents'] = collect($metric['recent_incidents'])
                ->sortByDesc(fn (array $incident) => $incident['last_activity_at'] ?? $incident['assigned_at'] ?? '')
                ->take(10)
                ->values()
                ->all();
            $metric['monthly_incident_counts'] = array_values($metric['_month_index']);

            unset(
                $metric['_month_index'],
                $metric['_assigned_incidents'],
                $metric['_completed_incidents'],
                $metric['_handled_this_month'],
                $metric['_on_time_responses'],
                $metric['_response_durations'],
                $metric['_resolution_durations'],
            );

            $payload[] = $metric;
        }

        $payload = [
            'staff' => $payload,
            'meta' => $this->buildMeta($generatedAt),
        ];

        Cache::put($cacheKey, $payload, now()->addSeconds(30));

        return $this->successResponse($payload, 'Staff performance data retrieved successfully.');
    }

    private function buildMonthTemplate(Carbon $generatedAt): array
    {
        return collect(range(5, 0))
            ->map(fn (int $monthsAgo) => $generatedAt->copy()->subMonths($monthsAgo)->startOfMonth())
            ->mapWithKeys(fn (Carbon $month) => [
                $month->format('Y-m') => [
                    'month' => $month->format('Y-m'),
                    'label' => $month->format('M'),
                    'year' => (int) $month->format('Y'),
                    'count' => 0,
                ],
            ])
            ->all();
    }

    private function buildMeta(Carbon $generatedAt): array
    {
        return [
            'generated_at' => $generatedAt->toIso8601String(),
            'response_sla_minutes' => self::RESPONSE_SLA_MINUTES,
        ];
    }

    private function parseTimestamp(mixed $value): ?Carbon
    {
        if (! $value) {
            return null;
        }

        return $value instanceof Carbon ? $value : Carbon::parse($value);
    }

    private function extractBarangay(string $addressLabel): string
    {
        $address = trim($addressLabel);
        $parts = array_filter(array_map('trim', explode(',', $address)));

        return $parts[0] ?? ($address !== '' ? $address : 'Unknown');
    }
}

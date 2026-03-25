<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Incident;
use App\Models\IncidentAssignment;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AnalyticsController extends Controller
{
    use ApiResponse;

    public function overview(Request $request)
    {
        $period = $this->resolveDateRange($request);

        if ($period['error']) {
            return $this->errorResponse('Validation failed.', $period['errors'], 422);
        }

        $periodIncidents = $this->loadAnalyticsIncidents($period['from'], $period['to']);

        return $this->successResponse([
            'from' => $period['from']->toDateString(),
            'to' => $period['to']->toDateString(),
            'kpis' => $this->buildKpisMetrics($period['from'], $period['to']),
            'response_time_trend' => $this->buildResponseTimeTrend($period['to']),
            'type_breakdown' => $this->buildTypeBreakdown($periodIncidents),
            'barangay_risk_rows' => $this->buildBarangayRiskRows($periodIncidents),
            'time_of_day_heatmap' => $this->buildTimeOfDayHeatmap($periodIncidents),
            'incident_rows' => $this->buildIncidentRows($periodIncidents),
        ], 'Analytics overview retrieved successfully.');
    }

    public function monthly(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $year = (int) ($validator->validated()['year'] ?? now()->year);
        $start = Carbon::create($year, 1, 1)->startOfDay();
        $end = Carbon::create($year, 12, 31)->endOfDay();

        $incidents = Incident::query()
            ->with(['logs' => function ($query) use ($start, $end): void {
                $query
                    ->where('new_status', 'resolved')
                    ->whereBetween('created_at', [$start, $end]);
            }])
            ->whereBetween('created_at', [$start, $end])
            ->get(['id', 'created_at']);

        $submittedByMonth = array_fill(1, 12, 0);
        $resolvedByMonth = array_fill(1, 12, 0);

        foreach ($incidents as $incident) {
            $submittedMonth = (int) $incident->created_at?->month;

            if ($submittedMonth > 0) {
                $submittedByMonth[$submittedMonth]++;
            }

            $resolvedLog = $incident->logs->first();

            if ($resolvedLog && $resolvedLog->created_at) {
                $resolvedMonth = (int) $resolvedLog->created_at->month;
                $resolvedByMonth[$resolvedMonth]++;
            }
        }

        $rows = collect(range(1, 12))
            ->map(fn (int $month) => [
                'month' => Carbon::create($year, $month, 1)->format('M'),
                'submitted' => $submittedByMonth[$month],
                'resolved' => $resolvedByMonth[$month],
            ])
            ->values();

        return $this->successResponse([
            'year' => $year,
            'rows' => $rows,
        ], 'Monthly analytics retrieved successfully.');
    }

    public function byType(Request $request)
    {
        $period = $this->resolveDateRange($request);

        if ($period['error']) {
            return $this->errorResponse('Validation failed.', $period['errors'], 422);
        }

        $rows = Incident::query()
            ->selectRaw('type, COUNT(*) as count')
            ->whereBetween('created_at', [$period['from'], $period['to']])
            ->groupBy('type')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($row) => [
                'type' => $row->type,
                'count' => (int) $row->count,
            ])
            ->values();

        return $this->successResponse([
            'from' => $period['from']->toDateString(),
            'to' => $period['to']->toDateString(),
            'rows' => $rows,
        ], 'Incident type analytics retrieved successfully.');
    }

    public function byBarangay(Request $request)
    {
        $period = $this->resolveDateRange($request);

        if ($period['error']) {
            return $this->errorResponse('Validation failed.', $period['errors'], 422);
        }

        $rows = Incident::query()
            ->whereBetween('created_at', [$period['from'], $period['to']])
            ->get(['address_label'])
            ->map(function ($incident) {
                $address = trim((string) $incident->address_label);
                $parts = array_filter(array_map('trim', explode(',', $address)));
                $barangay = $parts[0] ?? $address;

                return $barangay !== '' ? $barangay : 'Unknown';
            })
            ->countBy()
            ->map(fn (int $count, string $barangay) => [
                'barangay' => $barangay,
                'count' => $count,
            ])
            ->sortByDesc('count')
            ->take(5)
            ->values();

        return $this->successResponse([
            'from' => $period['from']->toDateString(),
            'to' => $period['to']->toDateString(),
            'rows' => $rows,
        ], 'Barangay analytics retrieved successfully.');
    }

    public function kpis(Request $request)
    {
        $period = $this->resolveDateRange($request);

        if ($period['error']) {
            return $this->errorResponse('Validation failed.', $period['errors'], 422);
        }

        return $this->successResponse(
            $this->buildKpisMetrics($period['from'], $period['to']) + [
                'from' => $period['from']->toDateString(),
                'to' => $period['to']->toDateString(),
            ],
            'Analytics KPI data retrieved successfully.'
        );
    }

    public function exportIncidents(Request $request): StreamedResponse|\Illuminate\Http\JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'format' => ['nullable', 'in:csv'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $validated = $validator->validated();
        $from = isset($validated['from']) ? Carbon::parse($validated['from'])->startOfDay() : null;
        $to = isset($validated['to']) ? Carbon::parse($validated['to'])->endOfDay() : null;

        $query = Incident::query()
            ->with([
                'reporter:id,full_name,phone',
                'assignments.staff:id,full_name',
                'logs.changedByUser:id,full_name',
            ])
            ->orderByDesc('created_at');

        if ($from && $to) {
            $query->whereBetween('created_at', [$from, $to]);
        } elseif ($from) {
            $query->where('created_at', '>=', $from);
        } elseif ($to) {
            $query->where('created_at', '<=', $to);
        }

        $incidents = $query->get();
        $filename = 'rescuelink-incidents-'.now()->format('Ymd-His').'.csv';

        return response()->streamDownload(function () use ($incidents): void {
            $handle = fopen('php://output', 'w');

            fputcsv($handle, [
                'ID',
                'Type',
                'Description',
                'Barangay',
                'Reporter Name',
                'Reporter Phone',
                'Submitted At',
                'Status',
                'Verified By',
                'Assigned To',
                'Resolved At',
                'IoT Generated',
            ]);

            foreach ($incidents as $incident) {
                $verifiedLog = $incident->logs->firstWhere('new_status', 'verified');
                $verifiedBy = $verifiedLog?->changedByUser?->full_name ?? '';
                $assignedTo = $incident->assignments->first()?->staff?->full_name ?? '';

                fputcsv($handle, [
                    $incident->id,
                    $incident->type,
                    str_replace(["\r", "\n"], [' ', ' '], (string) $incident->description),
                    $this->extractBarangay((string) $incident->address_label),
                    $incident->reporter?->full_name ?? 'Anonymous',
                    $incident->reporter?->phone ?? '',
                    $incident->created_at?->toDateTimeString(),
                    $incident->status,
                    $verifiedBy,
                    $assignedTo,
                    $incident->resolved_at?->toDateTimeString() ?? '',
                    $incident->is_iot_generated ? 'Yes' : 'No',
                ]);
            }

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv',
        ]);
    }

    private function avgHours(array $durations): float
    {
        if (empty($durations)) {
            return 0;
        }

        return round(array_sum($durations) / count($durations), 2);
    }

    private function buildKpisMetrics(Carbon $from, Carbon $to): array
    {
        $incidents = Incident::query()
            ->with(['logs' => function ($query): void {
                $query->whereIn('new_status', ['verified', 'resolved'])->orderBy('created_at');
            }])
            ->whereBetween('created_at', [$from, $to])
            ->get(['id', 'created_at', 'status']);

        $verificationDurations = [];
        $resolutionDurations = [];

        foreach ($incidents as $incident) {
            $verifiedLog = $incident->logs->firstWhere('new_status', 'verified');
            $resolvedLog = $incident->logs->firstWhere('new_status', 'resolved');

            if ($verifiedLog && $incident->created_at) {
                $verificationDurations[] = $incident->created_at->diffInMinutes($verifiedLog->created_at) / 60;
            }

            if ($verifiedLog && $resolvedLog) {
                $resolutionDurations[] = $verifiedLog->created_at->diffInMinutes($resolvedLog->created_at) / 60;
            }
        }

        $periodLengthDays = max(1, $from->diffInDays($to) + 1);
        $previousFrom = $from->copy()->subDays($periodLengthDays);
        $previousTo = $from->copy()->subDay()->endOfDay();

        $totalThisPeriod = $incidents->count();
        $totalLastPeriod = Incident::query()
            ->whereBetween('created_at', [$previousFrom, $previousTo])
            ->count();

        $pctChange = $totalLastPeriod === 0
            ? ($totalThisPeriod > 0 ? 100.0 : 0.0)
            : round((($totalThisPeriod - $totalLastPeriod) / $totalLastPeriod) * 100, 2);

        $activeStaffCount = IncidentAssignment::query()
            ->whereHas('incident', function ($query): void {
                $query->whereNotIn('status', ['resolved', 'rejected']);
            })
            ->distinct('staff_id')
            ->count('staff_id');

        return [
            'avg_verification_hours' => $this->avgHours($verificationDurations),
            'avg_resolution_hours' => $this->avgHours($resolutionDurations),
            'total_this_period' => $totalThisPeriod,
            'total_last_period' => $totalLastPeriod,
            'pct_change' => $pctChange,
            'active_staff_count' => $activeStaffCount,
        ];
    }

    private function loadAnalyticsIncidents(Carbon $from, Carbon $to): Collection
    {
        return Incident::query()
            ->with([
                'reporter:id,full_name',
                'assignments.staff:id,full_name',
                'logs' => function ($query): void {
                    $query
                        ->whereIn('new_status', ['verified', 'under_assessment', 'responding', 'resolved'])
                        ->orderBy('created_at');
                },
            ])
            ->whereBetween('created_at', [$from, $to])
            ->orderByDesc('created_at')
            ->get([
                'id',
                'reference_code',
                'reporter_id',
                'type',
                'address_label',
                'status',
                'created_at',
                'resolved_at',
            ]);
    }

    private function buildResponseTimeTrend(Carbon $to): Collection
    {
        $trendEnd = $to->copy()->endOfDay();
        $trendStart = $trendEnd->copy()->subDays(29)->startOfDay();

        $incidents = Incident::query()
            ->with(['logs' => function ($query): void {
                $query
                    ->whereIn('new_status', ['under_assessment', 'responding', 'resolved'])
                    ->orderBy('created_at');
            }])
            ->whereBetween('created_at', [$trendStart, $trendEnd])
            ->get(['id', 'created_at']);

        $responseGroups = $incidents
            ->map(function (Incident $incident) {
                $responseLog = $incident->logs->first();

                if (! $responseLog || ! $incident->created_at) {
                    return null;
                }

                return [
                    'date' => $incident->created_at->toDateString(),
                    'minutes' => $incident->created_at->diffInMinutes($responseLog->created_at),
                ];
            })
            ->filter()
            ->groupBy('date');

        return collect(range(0, 29))
            ->map(function (int $offset) use ($trendStart, $responseGroups) {
                $date = $trendStart->copy()->addDays($offset)->toDateString();
                $items = collect($responseGroups->get($date, []));

                return [
                    'date' => $date,
                    'label' => Carbon::parse($date)->format('M j'),
                    'avg_response_minutes' => $items->isNotEmpty()
                        ? round((float) $items->avg('minutes'), 1)
                        : null,
                    'responded_count' => $items->count(),
                ];
            })
            ->values();
    }

    private function buildTypeBreakdown(Collection $incidents): Collection
    {
        $total = max(1, $incidents->count());

        return $incidents
            ->countBy('type')
            ->map(fn (int $count, string $type) => [
                'type' => $type,
                'count' => $count,
                'share' => round(($count / $total) * 100, 1),
            ])
            ->sortByDesc('count')
            ->values();
    }

    private function buildBarangayRiskRows(Collection $incidents): Collection
    {
        return $incidents
            ->groupBy(fn (Incident $incident) => $this->extractBarangay((string) $incident->address_label))
            ->map(function (Collection $rows, string $barangay) {
                $total = $rows->count();
                $unresolved = $rows->filter(fn (Incident $incident) => ! in_array($incident->status, ['resolved', 'rejected'], true))->count();
                $unresolvedRate = $total > 0 ? round(($unresolved / $total) * 100, 1) : 0.0;

                return [
                    'barangay' => $barangay,
                    'total_incidents' => $total,
                    'unresolved_count' => $unresolved,
                    'unresolved_rate' => $unresolvedRate,
                    'risk_score' => round(($total * 0.6) + ($unresolved * 0.4), 1),
                ];
            })
            ->sortByDesc('risk_score')
            ->values();
    }

    private function buildTimeOfDayHeatmap(Collection $incidents): Collection
    {
        $labels = [
            1 => 'Mon',
            2 => 'Tue',
            3 => 'Wed',
            4 => 'Thu',
            5 => 'Fri',
            6 => 'Sat',
            7 => 'Sun',
        ];

        $counts = $incidents
            ->filter(fn (Incident $incident) => $incident->created_at !== null)
            ->countBy(fn (Incident $incident) => $incident->created_at->dayOfWeekIso.'-'.$incident->created_at->hour);

        return collect(range(1, 7))
            ->flatMap(fn (int $dayIndex) => collect(range(0, 23))->map(function (int $hour) use ($counts, $dayIndex, $labels) {
                return [
                    'day_index' => $dayIndex,
                    'day_label' => $labels[$dayIndex],
                    'hour' => $hour,
                    'count' => (int) ($counts[$dayIndex.'-'.$hour] ?? 0),
                ];
            }))
            ->values();
    }

    private function buildIncidentRows(Collection $incidents): Collection
    {
        return $incidents
            ->map(function (Incident $incident) {
                return [
                    'id' => $incident->id,
                    'reference_code' => $incident->reference_code,
                    'type' => $incident->type,
                    'barangay' => $this->extractBarangay((string) $incident->address_label),
                    'reporter_name' => $incident->reporter?->full_name ?? 'Anonymous',
                    'assigned_responder' => $incident->assignments->first()?->staff?->full_name,
                    'status' => $incident->status,
                    'created_at' => $incident->created_at?->toIso8601String(),
                    'response_time_minutes' => $this->calculateResponseMinutes($incident),
                    'resolution_time_minutes' => $this->calculateResolutionMinutes($incident),
                ];
            })
            ->values();
    }

    private function calculateResponseMinutes(Incident $incident): ?float
    {
        $responseLog = $incident->logs->first(fn ($log) => in_array($log->new_status, ['under_assessment', 'responding', 'resolved'], true));

        if (! $responseLog || ! $incident->created_at) {
            return null;
        }

        return (float) round($incident->created_at->diffInMinutes($responseLog->created_at), 1);
    }

    private function calculateResolutionMinutes(Incident $incident): ?float
    {
        $verifiedLog = $incident->logs->firstWhere('new_status', 'verified');
        $resolvedLog = $incident->logs->firstWhere('new_status', 'resolved');

        if (! $verifiedLog || ! $resolvedLog) {
            return null;
        }

        return (float) round($verifiedLog->created_at->diffInMinutes($resolvedLog->created_at), 1);
    }

    /**
     * @return array{from: Carbon, to: Carbon, error: bool, errors: array<string, array<int, string>>}
     */
    private function resolveDateRange(Request $request): array
    {
        $validator = Validator::make($request->all(), [
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        if ($validator->fails()) {
            return [
                'from' => now()->startOfMonth(),
                'to' => now()->endOfMonth(),
                'error' => true,
                'errors' => $validator->errors()->toArray(),
            ];
        }

        $validated = $validator->validated();

        $from = isset($validated['from'])
            ? Carbon::parse($validated['from'])->startOfDay()
            : now()->startOfMonth();
        $to = isset($validated['to'])
            ? Carbon::parse($validated['to'])->endOfDay()
            : now()->endOfMonth();

        return [
            'from' => $from,
            'to' => $to,
            'error' => false,
            'errors' => [],
        ];
    }

    private function extractBarangay(string $addressLabel): string
    {
        $address = trim($addressLabel);
        $parts = array_filter(array_map('trim', explode(',', $address)));

        return $parts[0] ?? ($address !== '' ? $address : 'Unknown');
    }
}

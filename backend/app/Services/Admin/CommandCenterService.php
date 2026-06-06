<?php

namespace App\Services\Admin;

use App\Http\Resources\Api\V1\IncidentSummaryResource;
use App\Models\Incident;
use App\Models\User;
use App\Repositories\IncidentRepository;
use App\Support\IncidentVerification;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class CommandCenterService
{
    private const ACTIVE_STATUSES = ['pending_verification', 'verified', 'under_assessment', 'responding'];

    private const RESPONSE_STATUSES = ['under_assessment', 'responding', 'resolved'];

    public function __construct(private readonly IncidentRepository $incidents)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function snapshot(): array
    {
        return Cache::remember('admin.command_center.snapshot.v4', now()->addSeconds(10), function (): array {
            $mapIncidents = $this->incidents->commandCenterMap(self::ACTIVE_STATUSES);
            $liveFeedIncidents = $this->incidents->commandCenterLiveFeed();

            return [
                'kpis' => $this->buildKpis(),
                'map_incidents' => IncidentSummaryResource::collection($mapIncidents)
                    ->resolve(),
                'live_feed' => $liveFeedIncidents
                    ->map(fn (Incident $incident) => $this->serializeLiveIncident($incident))
                    ->values(),
                'responders' => $this->buildResponderAvailability(),
            ];
        });
    }

    public function clear(): void
    {
        Cache::forget('admin.command_center.snapshot.v4');
        Cache::forget('admin.incident_kpis.v3');
        Cache::forget('admin.verified_staff.v2');
        Cache::forget('admin.triage_board.v3');
        Cache::forget('admin.staff_performance.v3');
    }

    /**
     * @return array<string, mixed>
     */
    public function kpis(): array
    {
        return Cache::remember('admin.incident_kpis.v3', now()->addSeconds(15), fn () => $this->buildKpis());
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function verifiedStaff(): array
    {
        return Cache::remember('admin.verified_staff.v2', now()->addMinute(), function (): array {
            return User::query()
                ->where('role', 'staff')
                ->where('status', 'verified')
                ->orderBy('full_name')
                ->get([
                    'id',
                    'full_name',
                    'email',
                    'phone',
                    'barangay',
                    'status',
                ])
                ->map(fn (User $staff) => [
                    'id' => $staff->id,
                    'full_name' => $staff->full_name,
                    'email' => $staff->email,
                    'phone' => $staff->phone,
                    'barangay' => $staff->barangay,
                    'status' => $staff->status,
                ])
                ->values()
                ->all();
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function buildKpis(): array
    {
        $statusCounts = Incident::query()
            ->selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');
        $avgResponseMinutes = $this->calculateAverageResponseMinutes();
        $todayStart = now()->startOfDay();
        $todayEnd = now()->endOfDay();

        $activeIncidents = collect(self::ACTIVE_STATUSES)
            ->sum(fn (string $status): int => (int) ($statusCounts[$status] ?? 0));

        $resolvedToday = DB::table('incident_logs')
            ->where('new_status', 'resolved')
            ->whereBetween('created_at', [$todayStart, $todayEnd])
            ->distinct('incident_id')
            ->count('incident_id');

        $pendingAssignments = Incident::query()
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->whereDoesntHave('assignments', function (Builder $query): void {
                $query->where('is_volunteer', false);
            })
            ->count();

        return [
            'active_incidents' => $activeIncidents,
            'avg_response_minutes' => $avgResponseMinutes,
            'resolved_today' => $resolvedToday,
            'pending_assignments' => $pendingAssignments,
            'total_today' => Incident::query()->whereBetween('created_at', [$todayStart, $todayEnd])->count(),
            'pending_verification' => (int) ($statusCounts['pending_verification'] ?? 0),
            'active_responding' => (int) collect(['verified', 'under_assessment', 'responding'])
                ->sum(fn (string $status): int => (int) ($statusCounts[$status] ?? 0)),
            'resolved_this_month' => Incident::query()
                ->where('status', 'resolved')
                ->whereBetween('resolved_at', [now()->startOfMonth(), now()->endOfMonth()])
                ->count(),
            'avg_response_hours' => round($avgResponseMinutes / 60, 2),
            'refreshed_at' => now()->toIso8601String(),
        ];
    }

    private function calculateAverageResponseMinutes(): float
    {
        $rows = DB::table('incidents')
            ->join('incident_logs', function ($join): void {
                $join
                    ->on('incident_logs.incident_id', '=', 'incidents.id')
                    ->whereIn('incident_logs.new_status', self::RESPONSE_STATUSES);
            })
            ->where('incidents.created_at', '>=', now()->subDays(30))
            ->select(
                'incidents.id',
                'incidents.created_at',
                DB::raw('MIN(incident_logs.created_at) as first_response_at')
            )
            ->groupBy('incidents.id', 'incidents.created_at')
            ->limit(2000)
            ->get();

        $durations = $rows
            ->map(function ($row): ?int {
                if (! $row->first_response_at) {
                    return null;
                }

                $minutes = Carbon::parse($row->created_at)->diffInMinutes(Carbon::parse($row->first_response_at), false);

                return $minutes >= 0 ? $minutes : null;
            })
            ->filter(fn ($value): bool => $value !== null)
            ->values();

        return $durations->isNotEmpty()
            ? (float) round((float) $durations->avg(), 1)
            : 0.0;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildResponderAvailability(): array
    {
        $assignmentCounts = DB::table('incident_assignments')
            ->join('incidents', 'incidents.id', '=', 'incident_assignments.incident_id')
            ->whereIn('incidents.status', ['verified', 'under_assessment', 'responding'])
            ->select('incident_assignments.staff_id', DB::raw('COUNT(DISTINCT incident_assignments.incident_id) as open_assignments'))
            ->groupBy('incident_assignments.staff_id');

        $latestActivity = DB::table('personal_access_tokens')
            ->where('tokenable_type', User::class)
            ->select('tokenable_id', DB::raw('MAX(COALESCE(last_used_at, created_at)) as last_seen_at'))
            ->groupBy('tokenable_id');

        return User::query()
            ->leftJoinSub($assignmentCounts, 'assignment_counts', function ($join): void {
                $join->on('users.id', '=', 'assignment_counts.staff_id');
            })
            ->leftJoinSub($latestActivity, 'latest_activity', function ($join): void {
                $join->on('users.id', '=', 'latest_activity.tokenable_id');
            })
            ->where('users.role', 'staff')
            ->where('users.status', 'verified')
            ->orderByDesc('latest_activity.last_seen_at')
            ->orderBy('users.full_name')
            ->get([
                'users.id',
                'users.full_name',
                'users.barangay',
                DB::raw('COALESCE(assignment_counts.open_assignments, 0) as current_assignment_count'),
                DB::raw('latest_activity.last_seen_at as last_seen_at'),
            ])
            ->map(function ($staff): array {
                $lastSeenAt = $staff->last_seen_at ? Carbon::parse($staff->last_seen_at) : null;
                $isOnline = $lastSeenAt?->greaterThanOrEqualTo(now()->subMinutes(10)) ?? false;

                return [
                    'id' => $staff->id,
                    'full_name' => $staff->full_name,
                    'barangay' => $staff->barangay,
                    'current_assignment_count' => (int) $staff->current_assignment_count,
                    'online' => $isOnline,
                    'status' => $isOnline ? 'online' : 'offline',
                    'last_seen_at' => $lastSeenAt?->toIso8601String(),
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeLiveIncident(Incident $incident): array
    {
        $severity = $this->determineSeverity($incident);

        return [
            'id' => $incident->id,
            'reference_code' => $incident->reference_code,
            'type' => $incident->type,
            'status' => $incident->status,
            'latitude' => (float) $incident->latitude,
            'longitude' => (float) $incident->longitude,
            'address_label' => $incident->address_label,
            'barangay' => IncidentVerification::extractBarangay((string) $incident->address_label),
            'description' => $incident->description,
            'reporter' => [
                'full_name' => $incident->reporter?->full_name,
            ],
            'assigned_responder' => $incident->latestAssignment?->staff?->full_name,
            'severity' => $severity['level'],
            'severity_weight' => $severity['weight'],
            'severity_score' => $severity['score'],
            'is_iot_generated' => (bool) $incident->is_iot_generated,
            'created_at' => $incident->created_at?->toIso8601String(),
        ];
    }

    /**
     * @return array{level: string, weight: float, score: int}
     */
    private function determineSeverity(Incident $incident): array
    {
        $score = 1;
        $ageMinutes = max(0, (int) $incident->created_at?->diffInMinutes(now()));

        if (in_array($incident->type, ['fire', 'medical'], true)) {
            $score += 2;
        }

        if (in_array($incident->type, ['crime', 'accident'], true)) {
            $score += 1;
        }

        if ($incident->is_iot_generated) {
            $score += 2;
        }

        if (in_array($incident->status, ['pending_verification', 'responding'], true)) {
            $score += 2;
        } elseif ($incident->status === 'under_assessment') {
            $score += 1;
        }

        if ($ageMinutes >= 45) {
            $score += 2;
        } elseif ($ageMinutes >= 15) {
            $score += 1;
        }

        if ($score >= 7) {
            return ['level' => 'critical', 'weight' => 1.0, 'score' => $score];
        }

        if ($score >= 5) {
            return ['level' => 'high', 'weight' => 0.75, 'score' => $score];
        }

        if ($score >= 3) {
            return ['level' => 'medium', 'weight' => 0.5, 'score' => $score];
        }

        return ['level' => 'low', 'weight' => 0.25, 'score' => $score];
    }
}

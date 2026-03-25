<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Incident;
use App\Models\User;
use App\Support\ApiResponse;
use App\Support\IncidentVerification;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class AdminCommandCenterController extends Controller
{
    use ApiResponse;

    private const ACTIVE_STATUSES = ['pending_verification', 'verified', 'under_assessment', 'responding'];

    private const RESPONSE_STATUSES = ['under_assessment', 'responding', 'resolved'];

    public function show()
    {
        $mapIncidents = Incident::query()
            ->with([
                'reporter:id,full_name',
                'assignments.staff:id,full_name',
            ])
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->orderByDesc('created_at')
            ->get([
                'id',
                'reference_code',
                'type',
                'status',
                'latitude',
                'longitude',
                'address_label',
                'description',
                'reporter_id',
                'is_iot_generated',
                'created_at',
            ]);

        $liveFeedIncidents = Incident::query()
            ->with([
                'reporter:id,full_name',
                'assignments.staff:id,full_name',
            ])
            ->where('status', '!=', 'rejected')
            ->orderByDesc('created_at')
            ->limit(10)
            ->get([
                'id',
                'reference_code',
                'type',
                'status',
                'latitude',
                'longitude',
                'address_label',
                'description',
                'reporter_id',
                'is_iot_generated',
                'created_at',
            ]);

        return $this->successResponse([
            'kpis' => $this->buildKpis(),
            'map_incidents' => $mapIncidents->map(fn (Incident $incident) => $this->serializeIncident($incident))->values(),
            'live_feed' => $liveFeedIncidents->map(fn (Incident $incident) => $this->serializeIncident($incident))->values(),
            'responders' => $this->buildResponderAvailability(),
        ], 'Command center data retrieved successfully.');
    }

    private function buildKpis(): array
    {
        $activeIncidents = Incident::query()
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->count();

        $resolvedToday = Incident::query()
            ->whereHas('logs', function (Builder $query): void {
                $query
                    ->where('new_status', 'resolved')
                    ->whereDate('created_at', now()->toDateString());
            })
            ->count();

        $pendingAssignments = Incident::query()
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->whereDoesntHave('assignments')
            ->count();

        $avgResponseMinutes = $this->calculateAverageResponseMinutes();

        return [
            'active_incidents' => $activeIncidents,
            'avg_response_minutes' => $avgResponseMinutes,
            'resolved_today' => $resolvedToday,
            'pending_assignments' => $pendingAssignments,
            'refreshed_at' => now()->toIso8601String(),
        ];
    }

    private function calculateAverageResponseMinutes(): float
    {
        $rows = DB::table('incidents')
            ->join('incident_logs', function ($join) {
                $join
                    ->on('incident_logs.incident_id', '=', 'incidents.id')
                    ->whereIn('incident_logs.new_status', self::RESPONSE_STATUSES);
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

                $createdAt = Carbon::parse($row->created_at);
                $firstResponseAt = Carbon::parse($row->first_response_at);
                $minutes = $createdAt->diffInMinutes($firstResponseAt, false);

                return $minutes >= 0 ? $minutes : null;
            })
            ->filter(fn ($value) => $value !== null)
            ->values();

        return $durations->isNotEmpty()
            ? (float) round((float) $durations->avg(), 1)
            : 0.0;
    }

    private function buildResponderAvailability(): Collection
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
            ->map(function ($staff) {
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
            ->values();
    }

    private function serializeIncident(Incident $incident): array
    {
        $severity = $this->determineSeverity($incident);

        return [
            'id' => $incident->id,
            'reference_code' => $incident->reference_code,
            'type' => $incident->type,
            'status' => $incident->status,
            'latitude' => $incident->latitude,
            'longitude' => $incident->longitude,
            'address_label' => $incident->address_label,
            'barangay' => IncidentVerification::extractBarangay((string) $incident->address_label),
            'description' => $incident->description,
            'reporter' => [
                'full_name' => $incident->reporter?->full_name,
            ],
            'assigned_responder' => $incident->assignments->first()?->staff?->full_name,
            'severity' => $severity['level'],
            'severity_weight' => $severity['weight'],
            'severity_score' => $severity['score'],
            'is_iot_generated' => (bool) $incident->is_iot_generated,
            'created_at' => optional($incident->created_at)->toIso8601String(),
        ];
    }

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
            return ['level' => 'critical', 'weight' => 1, 'score' => $score];
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

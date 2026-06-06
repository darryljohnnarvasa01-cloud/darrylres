<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Events\BroadcastAnnouncementEvent;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BroadcastAnnouncementRequest;
use App\Models\BroadcastMessage;
use App\Models\BroadcastRecipient;
use App\Models\Notification;
use App\Models\User;
use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AdminBroadcastController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $staff = $this->onlineStaff();

        return $this->successResponse([
            'recipients' => $staff->map(fn (object $member) => [
                'id' => $member->id,
                'full_name' => $member->full_name,
                'barangay' => $member->barangay,
                'last_seen_at' => $member->last_seen_at,
            ])->values(),
            'target_types' => [
                ['value' => 'staff', 'label' => 'Online staff'],
                ['value' => 'all', 'label' => 'All verified citizens'],
                ['value' => 'barangay', 'label' => 'Citizen barangay'],
                ['value' => 'polygon', 'label' => 'Citizen geofence'],
            ],
        ], 'Broadcast recipients retrieved successfully.');
    }

    public function store(BroadcastAnnouncementRequest $request)
    {
        $validated = $request->validated();
        $targetType = $validated['target_type'] ?? 'staff';
        $targetPolygon = $targetType === 'polygon'
            ? $this->normalizePolygon($validated['target_polygon'] ?? [])
            : null;

        if ($targetType === 'polygon' && count($targetPolygon) < 3) {
            return $this->errorResponse('A polygon broadcast requires at least three valid coordinates.', [
                'target_polygon' => ['Provide at least three latitude/longitude pairs.'],
            ]);
        }

        $recipients = $targetType === 'staff'
            ? $this->onlineStaff()
            : $this->citizenRecipients($targetType, $validated, $targetPolygon);
        $link = $validated['link'] ?? ($targetType === 'staff' ? '/staff' : '/broadcasts');
        $sentAt = now();

        $broadcast = BroadcastMessage::query()->create([
            'title' => $validated['title'],
            'message' => $validated['message'],
            'link' => $link,
            'target_type' => $targetType,
            'target_barangay' => $targetType === 'barangay' ? $validated['target_barangay'] : null,
            'target_polygon' => $targetPolygon,
            'sent_by' => $request->user()?->id,
            'created_at' => $sentAt,
        ]);

        if ($recipients->isNotEmpty()) {
            Notification::query()->insert(
                $recipients->map(fn (User $member) => [
                    'id' => (string) Str::uuid(),
                    'user_id' => $member->id,
                    'title' => $validated['title'],
                    'message' => $validated['message'],
                    'link' => $link,
                    'is_read' => false,
                    'created_at' => $sentAt,
                ])->all()
            );

            BroadcastRecipient::query()->insert(
                $recipients->map(fn (User $member) => [
                    'broadcast_id' => $broadcast->id,
                    'user_id' => $member->id,
                    'is_read' => false,
                    'created_at' => $sentAt,
                ])->all()
            );

            event(new BroadcastAnnouncementEvent(
                $recipients->map(fn (User $member) => $this->channelForRecipient($member, $targetType))->values()->all(),
                [
                    'id' => $broadcast->id,
                    'title' => $validated['title'],
                    'message' => $validated['message'],
                    'link' => $link,
                    'target_type' => $targetType,
                    'sender_name' => $request->user()?->full_name,
                    'created_at' => $sentAt->toIso8601String(),
                    'recipients_count' => $recipients->count(),
                ],
            ));
        }

        AuditLogger::record(
            $request->user(),
            'notification.broadcast',
            'Notification',
            [],
            [
                'title' => $validated['title'],
                'message' => $validated['message'],
                'link' => $link,
                'target_type' => $targetType,
                'target_barangay' => $targetType === 'barangay' ? $validated['target_barangay'] : null,
                'target_polygon' => $targetPolygon,
            ],
            metadata: [
                'broadcast_id' => $broadcast->id,
                'recipient_ids' => $recipients->pluck('id')->values()->all(),
                'recipients_count' => $recipients->count(),
            ],
        );

        return $this->successResponse([
            'id' => $broadcast->id,
            'title' => $validated['title'],
            'message' => $validated['message'],
            'link' => $link,
            'target_type' => $targetType,
            'target_barangay' => $targetType === 'barangay' ? $validated['target_barangay'] : null,
            'recipients_count' => $recipients->count(),
            'recipients' => $recipients->map(fn (User $member) => [
                'id' => $member->id,
                'full_name' => $member->full_name,
                'barangay' => $member->barangay,
                'last_seen_at' => $member->last_seen_at ?? null,
            ])->values(),
            'sent_at' => $sentAt->toIso8601String(),
        ], $recipients->isNotEmpty() ? 'Announcement broadcast successfully.' : 'No matching recipients were available for broadcast.');
    }

    private function onlineStaff(): Collection
    {
        $latestActivity = DB::table('personal_access_tokens')
            ->where('tokenable_type', User::class)
            ->select('tokenable_id', DB::raw('MAX(COALESCE(last_used_at, created_at)) as last_seen_at'))
            ->groupBy('tokenable_id');

        return User::query()
            ->joinSub($latestActivity, 'latest_activity', function ($join): void {
                $join->on('users.id', '=', 'latest_activity.tokenable_id');
            })
            ->where('users.role', 'staff')
            ->where('users.status', 'verified')
            ->where('latest_activity.last_seen_at', '>=', now()->subMinutes(10))
            ->orderBy('users.full_name')
            ->get([
                'users.id',
                'users.full_name',
                'users.barangay',
                DB::raw('latest_activity.last_seen_at as last_seen_at'),
            ]);
    }

    private function citizenRecipients(string $targetType, array $validated, ?array $targetPolygon): Collection
    {
        $citizens = User::query()
            ->where('role', 'citizen')
            ->where('status', 'verified')
            ->when(
                $targetType === 'barangay',
                fn ($query) => $query->where('barangay', $validated['target_barangay'])
            )
            ->orderBy('full_name')
            ->get([
                'id',
                'full_name',
                'barangay',
            ]);

        if ($targetType !== 'polygon') {
            return $citizens;
        }

        $locations = DB::table('incidents')
            ->whereIn('reporter_id', $citizens->pluck('id'))
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->orderByDesc('created_at')
            ->get([
                'reporter_id',
                'latitude',
                'longitude',
                'created_at',
            ])
            ->groupBy('reporter_id')
            ->map(fn (Collection $rows) => $rows->first());

        return $citizens
            ->filter(function (User $citizen) use ($locations, $targetPolygon): bool {
                $location = $locations->get($citizen->id);

                if (! $location) {
                    return false;
                }

                return $this->pointInPolygon(
                    (float) $location->latitude,
                    (float) $location->longitude,
                    $targetPolygon ?? []
                );
            })
            ->values();
    }

    private function channelForRecipient(User $user, string $targetType): string
    {
        return $targetType === 'staff'
            ? "staff.{$user->id}"
            : "incidents.{$user->id}";
    }

    /**
     * @return array<int, array{lat: float, lng: float}>
     */
    private function normalizePolygon(mixed $polygon): array
    {
        if (! is_array($polygon)) {
            return [];
        }

        $isGeoJson = strtolower((string) ($polygon['type'] ?? '')) === 'polygon';
        $points = $isGeoJson ? ($polygon['coordinates'][0] ?? []) : $polygon;

        if (! is_array($points)) {
            return [];
        }

        return collect($points)
            ->map(fn (mixed $point) => $this->normalizePoint($point, $isGeoJson))
            ->filter()
            ->values()
            ->all();
    }

    /**
     * @return array{lat: float, lng: float}|null
     */
    private function normalizePoint(mixed $point, bool $isGeoJson): ?array
    {
        if (! is_array($point)) {
            return null;
        }

        $lat = $point['lat'] ?? $point['latitude'] ?? null;
        $lng = $point['lng'] ?? $point['lon'] ?? $point['longitude'] ?? null;

        if ($lat === null && $lng === null && array_key_exists(0, $point) && array_key_exists(1, $point)) {
            $lat = $isGeoJson ? $point[1] : $point[0];
            $lng = $isGeoJson ? $point[0] : $point[1];
        }

        if (! is_numeric($lat) || ! is_numeric($lng)) {
            return null;
        }

        $lat = (float) $lat;
        $lng = (float) $lng;

        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
            return null;
        }

        return [
            'lat' => $lat,
            'lng' => $lng,
        ];
    }

    /**
     * @param  array<int, array{lat: float, lng: float}>  $polygon
     */
    private function pointInPolygon(float $lat, float $lng, array $polygon): bool
    {
        $inside = false;
        $count = count($polygon);

        for ($i = 0, $j = $count - 1; $i < $count; $j = $i++) {
            $latI = $polygon[$i]['lat'];
            $lngI = $polygon[$i]['lng'];
            $latJ = $polygon[$j]['lat'];
            $lngJ = $polygon[$j]['lng'];

            if (($latI > $lat) !== ($latJ > $lat)) {
                $intersectLng = (($lngJ - $lngI) * ($lat - $latI) / ($latJ - $latI)) + $lngI;

                if ($lng < $intersectLng) {
                    $inside = ! $inside;
                }
            }
        }

        return $inside;
    }
}

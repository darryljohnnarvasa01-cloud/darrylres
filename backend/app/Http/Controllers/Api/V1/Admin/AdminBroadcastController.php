<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Events\BroadcastAnnouncementEvent;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BroadcastAnnouncementRequest;
use App\Models\Notification;
use App\Models\User;
use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

class AdminBroadcastController extends Controller
{
    use ApiResponse;

    public function index()
    {
        $staff = $this->onlineStaff();

        return $this->successResponse([
            'recipients' => $staff->map(fn (object $member) => [
                'id' => $member->id,
                'full_name' => $member->full_name,
                'barangay' => $member->barangay,
                'last_seen_at' => $member->last_seen_at,
            ])->values(),
        ], 'Broadcast recipients retrieved successfully.');
    }

    public function store(BroadcastAnnouncementRequest $request)
    {
        $validated = $request->validated();
        $staff = $this->onlineStaff();
        $link = $validated['link'] ?? '/staff';
        $sentAt = now();

        if ($staff->isNotEmpty()) {
            foreach ($staff as $member) {
                Notification::query()->create([
                    'user_id' => $member->id,
                    'title' => $validated['title'],
                    'message' => $validated['message'],
                    'link' => $link,
                    'is_read' => false,
                    'created_at' => $sentAt,
                ]);
            }

            event(new BroadcastAnnouncementEvent(
                $staff->map(fn (object $member) => "staff.{$member->id}")->values()->all(),
                [
                    'title' => $validated['title'],
                    'message' => $validated['message'],
                    'link' => $link,
                    'sender_name' => $request->user()?->full_name,
                    'created_at' => $sentAt->toIso8601String(),
                    'recipients_count' => $staff->count(),
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
            ],
            metadata: [
                'recipient_ids' => $staff->pluck('id')->values()->all(),
                'recipients_count' => $staff->count(),
            ],
        );

        return $this->successResponse([
            'title' => $validated['title'],
            'message' => $validated['message'],
            'link' => $link,
            'recipients_count' => $staff->count(),
            'recipients' => $staff->map(fn (object $member) => [
                'id' => $member->id,
                'full_name' => $member->full_name,
                'barangay' => $member->barangay,
                'last_seen_at' => $member->last_seen_at,
            ])->values(),
            'sent_at' => $sentAt->toIso8601String(),
        ], $staff->isNotEmpty() ? 'Announcement broadcast successfully.' : 'No online staff were available for broadcast.');
    }

    private function onlineStaff()
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
}

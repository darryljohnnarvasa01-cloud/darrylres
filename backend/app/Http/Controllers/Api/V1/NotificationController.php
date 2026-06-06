<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\User;
use App\Support\ApiResponse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class NotificationController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $notifications = $this->queryForUser($request->user())
            ->orderByDesc('created_at')
            ->limit(50)
            ->get([
                'id',
                'user_id',
                'title',
                'message',
                'link',
                'channel',
                'is_read',
                'created_at',
            ]);

        return $this->successResponse([
            'notifications' => $notifications,
        ], 'Notifications retrieved successfully.');
    }

    public function markRead(Request $request, string $id)
    {
        $notification = $this->queryForUser($request->user())
            ->where('id', $id)
            ->first();

        if (! $notification) {
            return $this->errorResponse('Notification not found.', [], 404);
        }

        $notification->update(['is_read' => true]);
        $this->clearUnreadCountCache($request->user());

        return $this->successResponse([
            'notification' => $notification->fresh(),
        ], 'Notification marked as read.');
    }

    public function markAllRead(Request $request)
    {
        $updated = $this->queryForUser($request->user())
            ->where('is_read', false)
            ->update([
                'is_read' => true,
            ]);
        $this->clearUnreadCountCache($request->user());

        return $this->successResponse([
            'updated' => $updated,
        ], 'All notifications marked as read.');
    }

    public function unreadCount(Request $request)
    {
        $user = $request->user();
        $count = Cache::remember(
            $this->unreadCountCacheKey($user),
            now()->addSeconds(20),
            fn () => $this->queryForUser($user)->where('is_read', false)->count()
        );

        return $this->successResponse([
            'count' => $count,
        ], 'Unread notification count retrieved successfully.');
    }

    private function queryForUser(User $user): Builder
    {
        return Notification::query()
            ->when(
                $user->role === 'admin',
                function (Builder $query) use ($user): void {
                    $query->where(function (Builder $nested) use ($user): void {
                        $nested
                            ->where('user_id', $user->id)
                            ->orWhereNull('user_id');
                    });
                },
                fn (Builder $query) => $query->where('user_id', $user->id)
            );
    }

    private function unreadCountCacheKey(User $user): string
    {
        return "notifications.unread.{$user->id}.v2";
    }

    private function clearUnreadCountCache(User $user): void
    {
        Cache::forget($this->unreadCountCacheKey($user));
    }
}

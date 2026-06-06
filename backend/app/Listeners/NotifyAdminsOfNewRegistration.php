<?php

namespace App\Listeners;

use App\Events\NotificationCreated;
use App\Events\RegistrationSubmitted;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;

class NotifyAdminsOfNewRegistration implements ShouldQueue
{
    use InteractsWithQueue;

    public int $tries = 3;

    public int $backoff = 5;

    public function handle(RegistrationSubmitted $event): void
    {
        $fullName = (string) ($event->payload['full_name'] ?? 'New applicant');
        $barangay = (string) ($event->payload['barangay'] ?? 'Unknown barangay');

        $admins = User::query()
            ->where('role', 'admin')
            ->where('status', 'verified')
            ->get(['id']);

        if ($admins->isEmpty()) {
            return;
        }

        $notificationForBroadcast = null;

        foreach ($admins as $admin) {
            $notification = Notification::query()->create([
                'user_id' => $admin->id,
                'title' => 'New registration pending approval',
                'message' => "{$fullName} from {$barangay} submitted a new account registration.",
                'link' => '/admin/registrations',
                'is_read' => false,
                'created_at' => now(),
            ]);

            if (! $notificationForBroadcast) {
                $notificationForBroadcast = $notification;
            }
        }

        if ($notificationForBroadcast) {
            event(NotificationCreated::fromNotification($notificationForBroadcast, ['admin.notifications']));
        }
    }
}

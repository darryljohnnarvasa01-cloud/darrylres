<?php

namespace App\Listeners;

use App\Events\IotSmokeAlert;
use App\Events\NotificationCreated;
use App\Models\Notification;
use App\Models\User;

class NotifyAdminsOfIotAlert
{
    public function handle(IotSmokeAlert $event): void
    {
        $incidentId = (string) ($event->payload['incident_id'] ?? '');
        $deviceId = (string) ($event->payload['device_id'] ?? 'Unknown device');
        $location = (string) ($event->payload['location_name'] ?? 'Unknown location');
        $smokeLevel = (string) ($event->payload['smoke_level'] ?? '-');

        if ($incidentId === '') {
            return;
        }

        $title = "Smoke alert {$deviceId}";
        $message = "IoT smoke alert detected {$smokeLevel} ppm at {$location}.";
        $link = "/admin/incidents?incident={$incidentId}";
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
                'title' => $title,
                'message' => $message,
                'link' => $link,
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

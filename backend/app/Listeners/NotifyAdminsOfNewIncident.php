<?php

namespace App\Listeners;

use App\Events\NewIncidentSubmitted;
use App\Events\NotificationCreated;
use App\Models\Notification;
use App\Models\User;

class NotifyAdminsOfNewIncident
{
    /**
     * Handle the event.
     */
    public function handle(NewIncidentSubmitted $event): void
    {
        $incidentId = (string) ($event->payload['id'] ?? '');
        $type = strtoupper((string) ($event->payload['type'] ?? 'incident'));
        $location = (string) ($event->payload['address_label'] ?? 'Unknown location');
        $reporterName = (string) ($event->payload['reporter_name'] ?? 'Anonymous');

        if ($incidentId === '') {
            return;
        }

        $title = "New {$type} report #".substr($incidentId, 0, 8);
        $message = "New {$type} report from {$reporterName} at {$location}.";
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

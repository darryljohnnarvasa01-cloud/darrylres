<?php

namespace App\Listeners;

use App\Events\IncidentStatusUpdated;
use App\Events\NotificationCreated;
use App\Models\Notification;
use App\Models\User;

class NotifyAdminAndCitizenOnStatusUpdate
{
    /**
     * Handle the event.
     */
    public function handle(IncidentStatusUpdated $event): void
    {
        $incidentId = (string) ($event->payload['incident_id'] ?? '');
        $status = (string) ($event->payload['status'] ?? '');
        $staffName = (string) ($event->payload['staff_name'] ?? 'Responder');
        $location = (string) ($event->payload['address_label'] ?? 'Unknown location');
        $reporterId = (string) ($event->payload['reporter_id'] ?? '');

        if ($incidentId === '' || $status === '') {
            return;
        }

        $humanStatus = str_replace('_', ' ', $status);
        $title = 'Incident #'.substr($incidentId, 0, 8)." {$humanStatus}";
        $message = "{$staffName} updated the incident status to {$humanStatus} at {$location}.";
        $link = "/admin/incidents?incident={$incidentId}";

        $admins = User::query()
            ->where('role', 'admin')
            ->where('status', 'verified')
            ->get(['id']);

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

        if ($status === 'resolved' && $reporterId !== '') {
            $citizenNotification = Notification::query()->create([
                'user_id' => $reporterId,
                'title' => 'Incident #'.substr($incidentId, 0, 8).' resolved',
                'message' => "Your incident #{$incidentId} has been resolved.",
                'link' => "/my-reports?incident={$incidentId}",
                'is_read' => false,
                'created_at' => now(),
            ]);

            event(NotificationCreated::fromNotification($citizenNotification, ["incidents.{$reporterId}"]));
        }
    }
}

<?php

namespace App\Listeners;

use App\Events\IncidentAssignedToStaff;
use App\Events\NotificationCreated;
use App\Models\Notification;

class NotifyStaffOfAssignment
{
    /**
     * Handle the event.
     */
    public function handle(IncidentAssignedToStaff $event): void
    {
        $incidentId = (string) ($event->payload['incident_id'] ?? '');
        $type = strtoupper((string) ($event->payload['type'] ?? 'incident'));
        $location = (string) ($event->payload['address_label'] ?? 'Unknown location');

        if ($incidentId === '') {
            return;
        }

        $notification = Notification::query()->create([
            'user_id' => $event->staffId,
            'title' => 'Assigned to #'.substr($incidentId, 0, 8),
            'message' => "You have been assigned to a {$type} incident at {$location}.",
            'link' => "/staff/incidents/{$incidentId}",
            'is_read' => false,
            'created_at' => now(),
        ]);

        event(NotificationCreated::fromNotification($notification, ["staff.{$event->staffId}"]));
    }
}

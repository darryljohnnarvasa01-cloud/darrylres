<?php

namespace App\Listeners;

use App\Events\IncidentVerificationUpdated;
use App\Events\NotificationCreated;
use App\Models\Notification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;

class NotifyCitizenOfVerificationUpdate implements ShouldQueue
{
    use InteractsWithQueue;

    public int $tries = 3;

    public int $backoff = 5;

    /**
     * Handle the event.
     */
    public function handle(IncidentVerificationUpdated $event): void
    {
        $incidentId = (string) ($event->payload['incident_id'] ?? '');

        if ($incidentId === '' || ! $event->userId) {
            return;
        }

        $notification = Notification::query()->create([
            'user_id' => $event->userId,
            'title' => 'Report #'.substr($incidentId, 0, 8).' update',
            'message' => $event->message,
            'link' => "/my-reports?incident={$incidentId}",
            'is_read' => false,
            'created_at' => now(),
        ]);

        event(NotificationCreated::fromNotification($notification, ["incidents.{$event->userId}"]));
    }
}

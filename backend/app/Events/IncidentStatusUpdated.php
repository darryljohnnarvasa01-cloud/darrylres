<?php

namespace App\Events;

use App\Models\Incident;
use App\Models\User;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class IncidentStatusUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $payload;

    /**
     * Create a new event instance.
     */
    public function __construct(
        Incident $incident,
        User $staff,
        string $oldStatus,
        string $newStatus,
        string $notes
    ) {
        $this->payload = [
            'incident_id' => $incident->id,
            'type' => $incident->type,
            'old_status' => $oldStatus,
            'status' => $newStatus,
            'address_label' => $incident->address_label,
            'reporter_id' => $incident->reporter_id,
            'staff_id' => $staff->id,
            'staff_name' => $staff->full_name,
            'notes' => $notes,
            'updated_at' => now()->toIso8601String(),
        ];
    }

    public function broadcastAs(): string
    {
        return 'IncidentStatusUpdated';
    }

    /**
     * Get the channels the event should broadcast on.
     *
     * @return array<int, \Illuminate\Broadcasting\Channel>
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('admin.alerts'),
        ];
    }

    public function broadcastWith(): array
    {
        return $this->payload;
    }
}

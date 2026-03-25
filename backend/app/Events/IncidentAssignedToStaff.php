<?php

namespace App\Events;

use App\Models\Incident;
use App\Models\User;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class IncidentAssignedToStaff implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $payload;

    /**
     * Create a new event instance.
     */
    public function __construct(
        public string $staffId,
        Incident $incident
    ) {
        $this->payload = [
            'incident_id' => $incident->id,
            'type' => $incident->type,
            'status' => $incident->status,
            'address_label' => $incident->address_label,
            'incident_datetime' => $incident->incident_datetime?->toIso8601String(),
        ];
    }

    public static function fromIncident(Incident $incident, User $staff): self
    {
        return new self($staff->id, $incident);
    }

    public function broadcastAs(): string
    {
        return 'IncidentAssigned';
    }

    /**
     * Get the channels the event should broadcast on.
     *
     * @return array<int, \Illuminate\Broadcasting\Channel>
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("incidents.{$this->staffId}"),
        ];
    }

    public function broadcastWith(): array
    {
        return $this->payload;
    }
}

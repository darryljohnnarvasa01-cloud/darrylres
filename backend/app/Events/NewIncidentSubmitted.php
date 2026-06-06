<?php

namespace App\Events;

use App\Models\Incident;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NewIncidentSubmitted implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $payload;

    /**
     * Create a new event instance.
     */
    public function __construct(Incident $incident)
    {
        $this->payload = [
            'id' => $incident->id,
            'type' => $incident->type,
            'status' => $incident->status,
            'latitude' => $incident->latitude,
            'longitude' => $incident->longitude,
            'address_label' => $incident->address_label,
            'reporter_name' => $incident->reporter?->full_name,
            'submitted_at' => $incident->created_at?->toIso8601String(),
        ];
    }

    public function broadcastAs(): string
    {
        return 'NewIncidentSubmitted';
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

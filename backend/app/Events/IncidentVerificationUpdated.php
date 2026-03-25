<?php

namespace App\Events;

use App\Models\Incident;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class IncidentVerificationUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $payload;

    /**
     * Create a new event instance.
     */
    public function __construct(
        public string $userId,
        Incident $incident,
        public string $message
    ) {
        $this->payload = [
            'incident_id' => $incident->id,
            'status' => $incident->status,
            'message' => $this->message,
        ];
    }

    public static function forUser(string $userId, Incident $incident, string $message): self
    {
        return new self($userId, $incident, $message);
    }

    public function broadcastAs(): string
    {
        return 'IncidentVerificationUpdated';
    }

    /**
     * Get the channels the event should broadcast on.
     *
     * @return array<int, \Illuminate\Broadcasting\Channel>
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("incidents.{$this->userId}"),
        ];
    }

    public function broadcastWith(): array
    {
        return $this->payload;
    }
}

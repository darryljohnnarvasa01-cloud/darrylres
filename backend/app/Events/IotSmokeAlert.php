<?php

namespace App\Events;

use App\Models\Incident;
use App\Models\IotDevice;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class IotSmokeAlert implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $payload;

    /**
     * Create a new event instance.
     */
    public function __construct(
        IotDevice $device,
        Incident $incident,
        int $smokeLevel
    ) {
        $this->payload = [
            'device_id' => $device->device_id,
            'location_name' => $device->location_name,
            'smoke_level' => $smokeLevel,
            'incident_id' => $incident->id,
            'status' => $incident->status,
            'created_at' => $incident->created_at?->toIso8601String(),
        ];
    }

    public function broadcastAs(): string
    {
        return 'IotSmokeAlert';
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

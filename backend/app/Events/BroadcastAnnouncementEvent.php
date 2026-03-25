<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class BroadcastAnnouncementEvent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param  array<int, string>  $channels
     * @param  array<string, mixed>  $payload
     */
    public function __construct(
        public array $channels,
        public array $payload
    ) {}

    public function broadcastAs(): string
    {
        return 'BroadcastAnnouncement';
    }

    /**
     * @return array<int, \Illuminate\Broadcasting\Channel>
     */
    public function broadcastOn(): array
    {
        return collect($this->channels)
            ->map(fn (string $channelName) => new PrivateChannel($channelName))
            ->all();
    }

    public function broadcastWith(): array
    {
        return $this->payload;
    }
}

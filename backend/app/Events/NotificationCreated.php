<?php

namespace App\Events;

use App\Models\Notification;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NotificationCreated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $payload;

    /**
     * Create a new event instance.
     *
     * @param  array<int, string>  $channels
     */
    public function __construct(
        public array $channels,
        array $payload
    ) {
        $this->payload = $payload;
    }

    /**
     * @param  array<int, string>  $channels
     */
    public static function fromNotification(Notification $notification, array $channels): self
    {
        return new self($channels, [
            'id' => $notification->id,
            'title' => $notification->title,
            'message' => $notification->message,
            'link' => $notification->link,
            'channel' => $notification->channel,
            'is_read' => $notification->is_read,
            'created_at' => $notification->created_at?->toIso8601String(),
        ]);
    }

    public function broadcastAs(): string
    {
        return 'NotificationCreated';
    }

    /**
     * Get the channels the event should broadcast on.
     *
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

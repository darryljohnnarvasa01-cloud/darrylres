<?php

namespace App\Events;

use App\Models\User;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class RegistrationSubmitted
{
    use Dispatchable, SerializesModels;

    public array $payload;

    public function __construct(User $user)
    {
        $this->payload = [
            'user_id' => $user->id,
            'full_name' => $user->full_name,
            'barangay' => $user->barangay,
            'submitted_at' => $user->created_at?->toIso8601String(),
        ];
    }

    public static function fromUser(User $user): self
    {
        return new self($user);
    }
}

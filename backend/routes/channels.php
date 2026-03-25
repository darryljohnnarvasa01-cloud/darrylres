<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('admin.alerts', function (User $user): bool {
    return $user->role === 'admin';
});

Broadcast::channel('admin.notifications', function (User $user): bool {
    return $user->role === 'admin';
});

Broadcast::channel('staff.{userId}', function (User $user, string $userId): bool {
    return $user->role === 'staff' && $user->id === $userId;
});

Broadcast::channel('incidents.{userId}', function (User $user, string $userId): bool {
    return $user->id === $userId;
});

<?php

namespace Tests\Feature\Api\V1;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_list_recent_notifications(): void
    {
        $user = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');
        $other = $this->createUser(role: 'citizen', status: 'verified', email: 'other@example.com');

        Notification::query()->create([
            'user_id' => $user->id,
            'title' => 'Own notification',
            'message' => 'Visible to authenticated user.',
            'link' => '/my-reports',
            'is_read' => false,
            'created_at' => now(),
        ]);

        Notification::query()->create([
            'user_id' => $other->id,
            'title' => 'Other notification',
            'message' => 'Should not be visible.',
            'link' => '/my-reports',
            'is_read' => false,
            'created_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/v1/notifications');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.notifications')
            ->assertJsonPath('data.notifications.0.title', 'Own notification');
    }

    public function test_admin_notification_list_includes_broadcast_notifications_with_null_user_id(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');

        Notification::query()->create([
            'user_id' => $admin->id,
            'title' => 'Admin personal',
            'message' => 'Admin specific.',
            'link' => '/admin/dashboard',
            'is_read' => false,
            'created_at' => now(),
        ]);

        Notification::query()->create([
            'user_id' => null,
            'title' => 'Broadcast admin',
            'message' => 'Broadcast to admins.',
            'link' => '/admin/dashboard',
            'is_read' => false,
            'created_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/notifications');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(2, 'data.notifications');
    }

    public function test_user_can_mark_single_notification_as_read(): void
    {
        $user = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');
        $notification = Notification::query()->create([
            'user_id' => $user->id,
            'title' => 'Unread',
            'message' => 'Needs read flag update.',
            'link' => '/my-reports',
            'is_read' => false,
            'created_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $response = $this->patchJson("/api/v1/notifications/{$notification->id}/read");

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.notification.is_read', true);

        $this->assertDatabaseHas('notifications', [
            'id' => $notification->id,
            'is_read' => true,
        ]);
    }

    public function test_user_can_mark_all_notifications_as_read(): void
    {
        $user = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        Notification::query()->create([
            'user_id' => $user->id,
            'title' => 'First',
            'message' => 'First unread.',
            'link' => '/my-reports',
            'is_read' => false,
            'created_at' => now(),
        ]);

        Notification::query()->create([
            'user_id' => $user->id,
            'title' => 'Second',
            'message' => 'Second unread.',
            'link' => '/my-reports',
            'is_read' => false,
            'created_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $response = $this->patchJson('/api/v1/notifications/read-all');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.updated', 2);

        $this->assertSame(0, Notification::query()->where('user_id', $user->id)->where('is_read', false)->count());
    }

    public function test_unread_count_returns_only_unread_items_for_current_user(): void
    {
        $user = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        Notification::query()->create([
            'user_id' => $user->id,
            'title' => 'Unread one',
            'message' => 'Unread one.',
            'link' => '/my-reports',
            'is_read' => false,
            'created_at' => now(),
        ]);

        Notification::query()->create([
            'user_id' => $user->id,
            'title' => 'Read one',
            'message' => 'Read one.',
            'link' => '/my-reports',
            'is_read' => true,
            'created_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/v1/notifications/unread-count');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.count', 1);
    }

    private function createUser(
        string $role,
        string $status,
        string $email,
        string $fullName = 'Sample User'
    ): User {
        return User::query()->create([
            'full_name' => $fullName,
            'email' => $email,
            'password' => 'password123',
            'phone' => '09170000999',
            'address' => 'Valencia City',
            'barangay' => 'Poblacion',
            'role' => $role,
            'status' => $status,
        ]);
    }
}

<?php

namespace Tests\Feature\Admin;

use App\Events\BroadcastAnnouncementEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminBroadcastControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_broadcast_announcement_to_online_staff(): void
    {
        Event::fake([BroadcastAnnouncementEvent::class]);

        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $onlineStaff = $this->createUser(role: 'staff', status: 'verified', email: 'online@example.com', fullName: 'Online Staff');
        $offlineStaff = $this->createUser(role: 'staff', status: 'verified', email: 'offline@example.com', fullName: 'Offline Staff');

        $this->insertAccessToken($onlineStaff, Carbon::now()->subMinutes(5));
        $this->insertAccessToken($offlineStaff, Carbon::now()->subMinutes(25));

        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/admin/broadcast', [
            'title' => 'Storm watch',
            'message' => 'Stand by at your assigned staging points until further instruction.',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.title', 'Storm watch')
            ->assertJsonPath('data.recipients_count', 1)
            ->assertJsonPath('data.recipients.0.id', $onlineStaff->id);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $onlineStaff->id,
            'title' => 'Storm watch',
            'link' => '/staff',
        ]);
        $this->assertDatabaseMissing('notifications', [
            'user_id' => $offlineStaff->id,
            'title' => 'Storm watch',
        ]);

        Event::assertDispatched(BroadcastAnnouncementEvent::class, function (BroadcastAnnouncementEvent $event) use ($onlineStaff) {
            return $event->channels === ["staff.{$onlineStaff->id}"]
                && $event->payload['title'] === 'Storm watch'
                && $event->payload['recipients_count'] === 1;
        });
    }

    public function test_admin_can_list_online_broadcast_recipients(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $onlineStaff = $this->createUser(role: 'staff', status: 'verified', email: 'online@example.com', fullName: 'Online Staff');
        $offlineStaff = $this->createUser(role: 'staff', status: 'verified', email: 'offline@example.com', fullName: 'Offline Staff');

        $this->insertAccessToken($onlineStaff, Carbon::now()->subMinutes(3));
        $this->insertAccessToken($offlineStaff, Carbon::now()->subMinutes(20));

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/broadcast/recipients');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.recipients')
            ->assertJsonPath('data.recipients.0.id', $onlineStaff->id);
    }

    public function test_non_admin_cannot_broadcast_announcements(): void
    {
        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');

        Sanctum::actingAs($staff);

        $response = $this->postJson('/api/v1/admin/broadcast', [
            'title' => 'Blocked',
            'message' => 'This should not be accepted.',
        ]);

        $response
            ->assertForbidden()
            ->assertJsonPath('success', false);
    }

    private function insertAccessToken(User $user, Carbon $lastUsedAt): void
    {
        DB::table('personal_access_tokens')->insert([
            'tokenable_type' => User::class,
            'tokenable_id' => $user->id,
            'name' => 'test-token',
            'token' => hash('sha256', $user->id.$lastUsedAt->timestamp),
            'abilities' => json_encode(['*']),
            'last_used_at' => $lastUsedAt,
            'expires_at' => null,
            'created_at' => $lastUsedAt->copy()->subMinute(),
            'updated_at' => $lastUsedAt,
        ]);
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

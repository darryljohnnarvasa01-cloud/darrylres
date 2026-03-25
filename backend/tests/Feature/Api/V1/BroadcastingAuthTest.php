<?php

namespace Tests\Feature\Api\V1;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BroadcastingAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_admin_can_authorize_private_admin_channel(): void
    {
        $admin = User::query()->create([
            'full_name' => 'CDRRMO Admin',
            'email' => 'admin@example.com',
            'password' => 'password123',
            'phone' => '09170000100',
            'address' => 'Valencia City',
            'barangay' => 'Poblacion',
            'role' => 'admin',
            'status' => 'verified',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->postJson('/broadcasting/auth', [
            'channel_name' => 'private-admin.notifications',
            'socket_id' => '1234.5678',
        ]);

        $response->assertOk();
    }

    public function test_unauthenticated_broadcasting_auth_returns_401_json(): void
    {
        $response = $this->postJson('/broadcasting/auth', [
            'channel_name' => 'private-admin.notifications',
            'socket_id' => '1234.5678',
        ]);

        $response
            ->assertUnauthorized()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Unauthenticated.');
    }
}

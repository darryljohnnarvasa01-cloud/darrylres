<?php

namespace Tests\Feature\Api\V1;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SystemControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_view_system_health(): void
    {
        $admin = $this->createUser('admin', 'verified', 'admin@example.com');

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/system/health');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'healthy')
            ->assertJsonPath('data.services.database.ok', true)
            ->assertJsonPath('data.services.queue.ok', true)
            ->assertJsonStructure([
                'data' => [
                    'app_name',
                    'environment',
                    'timestamp',
                    'status',
                    'services' => [
                        'database' => ['ok', 'driver', 'error'],
                        'queue' => ['ok', 'connection', 'pending_jobs', 'failed_jobs', 'error'],
                        'cache' => ['ok', 'store'],
                        'broadcast' => ['ok', 'connection'],
                        'storage' => ['ok', 'disk', 'path', 'error'],
                    ],
                    'totals' => [
                        'users',
                        'incidents',
                        'open_incidents',
                        'active_iot_devices',
                        'online_iot_devices',
                        'error',
                    ],
                ],
            ]);
    }

    public function test_non_admin_cannot_view_system_health(): void
    {
        $citizen = $this->createUser('citizen', 'verified', 'citizen@example.com');

        Sanctum::actingAs($citizen);

        $response = $this->getJson('/api/v1/admin/system/health');

        $response
            ->assertForbidden()
            ->assertJsonPath('success', false);
    }

    private function createUser(string $role, string $status, string $email): User
    {
        return User::query()->create([
            'full_name' => 'Sample User',
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

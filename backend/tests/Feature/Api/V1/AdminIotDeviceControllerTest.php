<?php

namespace Tests\Feature\Api\V1;

use App\Models\Incident;
use App\Models\IotDevice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminIotDeviceControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_iot_devices(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');

        IotDevice::query()->create([
            'device_id' => 'SMOKE-001',
            'location_name' => 'Poblacion',
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'smoke_threshold' => 300,
            'api_key' => Hash::make('device-key-1'),
            'is_active' => true,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/iot-devices');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.devices')
            ->assertJsonPath('data.devices.0.device_id', 'SMOKE-001')
            ->assertJsonMissingPath('data.devices.0.api_key');
    }

    public function test_index_includes_alert_history_and_active_incident_context(): void
    {
        Carbon::setTestNow('2026-03-20 12:00:00');

        try {
            $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');

            $device = IotDevice::query()->create([
                'device_id' => 'SMOKE-ALERT-1',
                'location_name' => 'Poblacion Sensor',
                'latitude' => 7.9062,
                'longitude' => 125.0936,
                'smoke_threshold' => 300,
                'api_key' => Hash::make('device-key-1'),
                'is_active' => true,
                'last_ping_at' => Carbon::parse('2026-03-20 11:58:00'),
            ]);

            $iotIncident = Incident::query()->create([
                'reporter_id' => null,
                'type' => 'fire',
                'description' => 'Automated smoke alert.',
                'incident_datetime' => Carbon::parse('2026-03-20 11:55:00'),
                'latitude' => 7.9062,
                'longitude' => 125.0936,
                'address_label' => 'Poblacion Sensor',
                'status' => 'pending_verification',
                'is_iot_generated' => true,
                'device_id' => $device->device_id,
            ]);
            $iotIncident->forceFill([
                'created_at' => Carbon::parse('2026-03-20 11:55:00'),
                'updated_at' => Carbon::parse('2026-03-20 11:55:00'),
            ])->saveQuietly();

            $manualIncident = Incident::query()->create([
                'reporter_id' => null,
                'type' => 'fire',
                'description' => 'Nearby active incident.',
                'incident_datetime' => Carbon::parse('2026-03-20 11:50:00'),
                'latitude' => 7.9065,
                'longitude' => 125.0939,
                'address_label' => 'Poblacion Main Road',
                'status' => 'responding',
                'is_iot_generated' => false,
            ]);
            $manualIncident->forceFill([
                'created_at' => Carbon::parse('2026-03-20 11:50:00'),
                'updated_at' => Carbon::parse('2026-03-20 11:50:00'),
            ])->saveQuietly();

            Sanctum::actingAs($admin);

            $response = $this->getJson('/api/v1/admin/iot-devices');

            $response
                ->assertOk()
                ->assertJsonPath('success', true)
                ->assertJsonPath('data.devices.0.device_id', 'SMOKE-ALERT-1')
                ->assertJsonPath('data.devices.0.status', 'alert')
                ->assertJsonPath('data.devices.0.recent_alert_count', 1)
                ->assertJsonPath('data.devices.0.open_alert_incident.id', $iotIncident->id)
                ->assertJsonCount(2, 'data.active_incidents')
                ->assertJsonPath('data.history_window_days', 7);

            $this->assertSame(
                $manualIncident->id,
                collect($response->json('data.active_incidents'))->firstWhere('id', $manualIncident->id)['id']
            );
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_admin_can_create_iot_device_and_receive_raw_api_key_once(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/admin/iot-devices', [
            'device_id' => 'SMOKE-002',
            'location_name' => 'Lumbo',
            'latitude' => 7.9064,
            'longitude' => 125.0939,
            'smoke_threshold' => 350,
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.device.device_id', 'SMOKE-002');

        $rawApiKey = $response->json('data.api_key');
        $this->assertNotEmpty($rawApiKey);

        $device = IotDevice::query()->where('device_id', 'SMOKE-002')->first();
        $this->assertNotNull($device);
        $this->assertTrue(Hash::check($rawApiKey, $device->api_key));
    }

    public function test_admin_can_update_iot_device_threshold_and_status(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $device = IotDevice::query()->create([
            'device_id' => 'SMOKE-003',
            'location_name' => 'Bagontaas',
            'latitude' => 7.9065,
            'longitude' => 125.0940,
            'smoke_threshold' => 300,
            'api_key' => Hash::make('device-key-3'),
            'is_active' => true,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->patchJson("/api/v1/admin/iot-devices/{$device->id}", [
            'smoke_threshold' => 450,
            'is_active' => false,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.device.smoke_threshold', 450)
            ->assertJsonPath('data.device.is_active', false);

        $this->assertDatabaseHas('iot_devices', [
            'id' => $device->id,
            'smoke_threshold' => 450,
            'is_active' => false,
        ]);
    }

    public function test_admin_can_delete_iot_device(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $device = IotDevice::query()->create([
            'device_id' => 'SMOKE-004',
            'location_name' => 'Pinatilan',
            'latitude' => 7.9068,
            'longitude' => 125.0942,
            'smoke_threshold' => 300,
            'api_key' => Hash::make('device-key-4'),
            'is_active' => true,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->deleteJson("/api/v1/admin/iot-devices/{$device->id}");

        $response
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertDatabaseMissing('iot_devices', [
            'id' => $device->id,
        ]);
    }

    public function test_non_admin_cannot_manage_iot_devices(): void
    {
        $citizen = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');
        Sanctum::actingAs($citizen);

        $response = $this->getJson('/api/v1/admin/iot-devices');

        $response
            ->assertForbidden()
            ->assertJsonPath('success', false);
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

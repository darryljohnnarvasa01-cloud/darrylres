<?php

namespace Tests\Feature\Api\V1;

use App\Events\IotSmokeAlert;
use App\Models\IotDevice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class IotControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_iot_alert_requires_bearer_api_key(): void
    {
        $response = $this->postJson('/api/v1/iot/alert', [
            'device_id' => 'SMOKE-001',
            'smoke_level' => 250,
            'timestamp' => now()->toIso8601String(),
        ]);

        $response
            ->assertUnauthorized()
            ->assertJsonPath('success', false);
    }

    public function test_normal_smoke_reading_returns_reading_received(): void
    {
        $rawKey = 'plain-iot-key-001';
        $this->createDevice(deviceId: 'SMOKE-001', rawApiKey: $rawKey, threshold: 300);

        $response = $this
            ->withToken($rawKey)
            ->postJson('/api/v1/iot/alert', [
                'device_id' => 'SMOKE-001',
                'smoke_level' => 240,
                'timestamp' => now()->toIso8601String(),
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Reading received.');

        $this->assertDatabaseCount('incidents', 0);
    }

    public function test_threshold_breach_creates_iot_incident_and_broadcasts_alert(): void
    {
        Event::fake([IotSmokeAlert::class]);

        $rawKey = 'plain-iot-key-002';
        $device = $this->createDevice(deviceId: 'SMOKE-002', rawApiKey: $rawKey, threshold: 300);

        $response = $this
            ->withToken($rawKey)
            ->postJson('/api/v1/iot/alert', [
                'device_id' => 'SMOKE-002',
                'smoke_level' => 410,
                'timestamp' => now()->toIso8601String(),
            ]);

        $response
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Alert created.');

        $this->assertDatabaseHas('incidents', [
            'type' => 'fire',
            'is_iot_generated' => true,
            'device_id' => $device->device_id,
            'status' => 'pending_verification',
        ]);

        Event::assertDispatched(IotSmokeAlert::class);
    }

    public function test_threshold_breach_is_deduplicated_within_ten_minutes_for_open_incident(): void
    {
        Event::fake([IotSmokeAlert::class]);

        $rawKey = 'plain-iot-key-003';
        $device = $this->createDevice(deviceId: 'SMOKE-003', rawApiKey: $rawKey, threshold: 300);

        $this->postJson('/api/v1/iot/alert', [
            'device_id' => $device->device_id,
            'smoke_level' => 450,
            'timestamp' => now()->toIso8601String(),
        ], [
            'Authorization' => "Bearer {$rawKey}",
        ])->assertCreated();

        $response = $this->postJson('/api/v1/iot/alert', [
            'device_id' => $device->device_id,
            'smoke_level' => 420,
            'timestamp' => now()->toIso8601String(),
        ], [
            'Authorization' => "Bearer {$rawKey}",
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Dedup skipped.');

        $this->assertDatabaseCount('incidents', 1);
        Event::assertDispatchedTimes(IotSmokeAlert::class, 1);
    }

    public function test_iot_alert_rejects_payload_device_mismatch(): void
    {
        $rawKey = 'plain-iot-key-004';
        $this->createDevice(deviceId: 'SMOKE-004', rawApiKey: $rawKey, threshold: 300);
        $this->createDevice(deviceId: 'SMOKE-005', rawApiKey: 'other-key-005', threshold: 300);

        $response = $this
            ->withToken($rawKey)
            ->postJson('/api/v1/iot/alert', [
                'device_id' => 'SMOKE-005',
                'smoke_level' => 450,
                'timestamp' => now()->toIso8601String(),
            ]);

        $response
            ->assertUnauthorized()
            ->assertJsonPath('success', false);
    }

    private function createDevice(
        string $deviceId,
        string $rawApiKey,
        int $threshold,
        bool $isActive = true
    ): IotDevice {
        return IotDevice::query()->create([
            'device_id' => $deviceId,
            'location_name' => 'Barangay Poblacion Sensor',
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'smoke_threshold' => $threshold,
            'api_key' => Hash::make($rawApiKey),
            'is_active' => $isActive,
        ]);
    }
}

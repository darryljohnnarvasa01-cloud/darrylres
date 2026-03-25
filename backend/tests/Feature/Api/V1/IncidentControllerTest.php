<?php

namespace Tests\Feature\Api\V1;

use App\Models\Incident;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class IncidentControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_citizen_can_submit_incident_with_media(): void
    {
        Storage::fake('public');

        $citizen = $this->createUser(role: 'citizen', status: 'verified');
        Sanctum::actingAs($citizen);

        $response = $this->postJson('/api/v1/incidents', [
            'type' => 'fire',
            'description' => 'Visible smoke from warehouse near the main road intersection.',
            'incident_datetime' => now()->subMinutes(5)->toIso8601String(),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'media' => [
                UploadedFile::fake()->image('evidence.jpg'),
            ],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.incident.type', 'fire')
            ->assertJsonPath('data.incident.status', 'pending_verification');

        $referenceCode = $response->json('data.incident.reference_code');
        $this->assertIsString($referenceCode);
        $this->assertStringStartsWith('RLK-', $referenceCode);

        $this->assertDatabaseCount('incidents', 1);
        $this->assertDatabaseCount('incident_media', 1);
        $this->assertDatabaseCount('incident_logs', 1);
    }

    public function test_citizen_can_submit_incident_with_local_datetime_and_client_timezone(): void
    {
        Storage::fake('public');

        $citizen = $this->createUser(role: 'citizen', status: 'verified', email: 'timezone@example.com');
        Sanctum::actingAs($citizen);

        $localDateTime = Carbon::now('Asia/Manila')->subMinutes(5)->format('Y-m-d\TH:i');

        $response = $this->postJson('/api/v1/incidents', [
            'type' => 'medical',
            'description' => 'Citizen submitted a local datetime string from a browser datetime-local control.',
            'incident_datetime' => $localDateTime,
            'client_timezone' => 'Asia/Manila',
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'media' => [
                UploadedFile::fake()->image('timezone-evidence.jpg'),
            ],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.incident.type', 'medical');
    }

    public function test_duplicate_incident_is_blocked_without_force_submit(): void
    {
        $citizen = $this->createUser(role: 'citizen', status: 'verified');
        Sanctum::actingAs($citizen);

        Incident::query()->create([
            'reporter_id' => $citizen->id,
            'type' => 'fire',
            'description' => 'Initial fire report with enough details to pass validation.',
            'incident_datetime' => now()->subMinutes(10),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
        ]);

        $response = $this->postJson('/api/v1/incidents', [
            'type' => 'fire',
            'description' => 'Another visible fire report at nearly the same coordinates and timeframe.',
            'incident_datetime' => now()->subMinutes(2)->toIso8601String(),
            'latitude' => 7.90621,
            'longitude' => 125.09361,
            'address_label' => 'Poblacion, Valencia City',
            'media' => [
                UploadedFile::fake()->image('evidence.jpg'),
            ],
        ]);

        $response
            ->assertStatus(409)
            ->assertJsonPath('success', false)
            ->assertJsonPath('duplicate', true);
    }

    public function test_force_submit_bypasses_duplicate_block(): void
    {
        Storage::fake('public');

        $citizen = $this->createUser(role: 'citizen', status: 'verified');
        Sanctum::actingAs($citizen);

        Incident::query()->create([
            'reporter_id' => $citizen->id,
            'type' => 'fire',
            'description' => 'Initial fire report with enough details to pass validation.',
            'incident_datetime' => now()->subMinutes(10),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
        ]);

        $response = $this->postJson('/api/v1/incidents', [
            'type' => 'fire',
            'description' => 'Second fire report accepted because the user confirmed submit anyway.',
            'incident_datetime' => now()->subMinutes(1)->toIso8601String(),
            'latitude' => 7.90621,
            'longitude' => 125.09361,
            'address_label' => 'Poblacion, Valencia City',
            'force_submit' => true,
            'media' => [
                UploadedFile::fake()->image('evidence.jpg'),
            ],
        ]);

        $response->assertCreated();
        $this->assertDatabaseCount('incidents', 2);
    }

    public function test_mine_returns_only_authenticated_citizen_incidents(): void
    {
        $owner = $this->createUser(role: 'citizen', status: 'verified', email: 'owner@example.com');
        $other = $this->createUser(role: 'citizen', status: 'verified', email: 'other@example.com');

        Incident::query()->create([
            'reporter_id' => $owner->id,
            'type' => 'medical',
            'description' => 'Owner incident one with enough details for storage.',
            'incident_datetime' => now()->subMinutes(20),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
        ]);

        Incident::query()->create([
            'reporter_id' => $other->id,
            'type' => 'crime',
            'description' => 'Other user incident should not appear in mine endpoint response.',
            'incident_datetime' => now()->subMinutes(15),
            'latitude' => 7.9065,
            'longitude' => 125.0941,
            'address_label' => 'Lumbo',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
        ]);

        Sanctum::actingAs($owner);

        $response = $this->getJson('/api/v1/incidents/mine');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.incidents.data')
            ->assertJsonPath('data.incidents.data.0.reporter_id', $owner->id);
    }

    public function test_citizen_cannot_view_other_users_incident_detail(): void
    {
        $owner = $this->createUser(role: 'citizen', status: 'verified', email: 'owner@example.com');
        $viewer = $this->createUser(role: 'citizen', status: 'verified', email: 'viewer@example.com');

        $incident = Incident::query()->create([
            'reporter_id' => $owner->id,
            'type' => 'accident',
            'description' => 'Incident belongs to another citizen and should be restricted from access.',
            'incident_datetime' => now()->subMinutes(8),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Bagontaas',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
        ]);

        Sanctum::actingAs($viewer);

        $response = $this->getJson("/api/v1/incidents/{$incident->id}");

        $response
            ->assertForbidden()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'You are not allowed to view this incident.');
    }

    public function test_admin_can_view_any_incident_detail(): void
    {
        $owner = $this->createUser(role: 'citizen', status: 'verified', email: 'owner@example.com');
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');

        $incident = Incident::query()->create([
            'reporter_id' => $owner->id,
            'type' => 'flood',
            'description' => 'Incident can be viewed by admin users regardless of ownership.',
            'incident_datetime' => now()->subMinutes(6),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Lumbo',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson("/api/v1/incidents/{$incident->id}");

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.incident.id', $incident->id);
    }

    public function test_non_citizen_cannot_submit_incident(): void
    {
        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');
        Sanctum::actingAs($staff);

        $response = $this->postJson('/api/v1/incidents', [
            'type' => 'fire',
            'description' => 'Staff user should be blocked from citizen-only incident submit endpoint.',
            'incident_datetime' => now()->subMinutes(2)->toIso8601String(),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion',
            'media' => [
                UploadedFile::fake()->image('evidence.jpg'),
            ],
        ]);

        $response
            ->assertForbidden()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'You are not allowed to access this resource.');
    }

    private function createUser(
        string $role,
        string $status,
        string $email = 'user@example.com'
    ): User {
        return User::query()->create([
            'full_name' => 'Sample User',
            'email' => $email,
            'password' => 'password123',
            'phone' => '09170000300',
            'address' => 'Valencia City',
            'barangay' => 'Poblacion',
            'role' => $role,
            'status' => $status,
        ]);
    }
}

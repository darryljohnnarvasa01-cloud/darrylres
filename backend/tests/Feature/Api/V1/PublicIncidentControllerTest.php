<?php

namespace Tests\Feature\Api\V1;

use App\Models\Incident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicIncidentControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_map_returns_only_active_verified_incidents_with_public_fields(): void
    {
        $reporter = $this->createUser('citizen', 'verified', 'citizen@example.com');

        Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Verified incident should be visible in public map endpoint.',
            'incident_datetime' => now()->subMinutes(10),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'status' => 'verified',
            'is_iot_generated' => false,
        ]);

        Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'medical',
            'description' => 'Pending incident should be excluded from public map endpoint.',
            'incident_datetime' => now()->subMinutes(5),
            'latitude' => 7.9063,
            'longitude' => 125.0937,
            'address_label' => 'Lumbo, Valencia City',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
        ]);

        $response = $this->getJson('/api/v1/public/incidents/map');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.incidents')
            ->assertJsonPath('data.incidents.0.status', 'verified')
            ->assertJsonMissingPath('data.incidents.0.description');
    }

    public function test_public_recent_respects_limit_and_order(): void
    {
        $reporter = $this->createUser('citizen', 'verified', 'citizen@example.com');

        $first = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'First recent incident.',
            'incident_datetime' => now()->subMinutes(20),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'status' => 'verified',
            'is_iot_generated' => false,
        ]);

        $first->forceFill([
            'created_at' => now()->subMinutes(20),
            'updated_at' => now()->subMinutes(20),
        ])->saveQuietly();

        $second = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'crime',
            'description' => 'Second recent incident.',
            'incident_datetime' => now()->subMinutes(5),
            'latitude' => 7.9064,
            'longitude' => 125.0939,
            'address_label' => 'Bagontaas, Valencia City',
            'status' => 'responding',
            'is_iot_generated' => false,
        ]);

        $second->forceFill([
            'created_at' => now()->subMinutes(5),
            'updated_at' => now()->subMinutes(5),
        ])->saveQuietly();

        $response = $this->getJson('/api/v1/public/incidents/recent?limit=1');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.incidents')
            ->assertJsonPath('data.incidents.0.id', $second->id);
    }

    public function test_public_stats_returns_expected_keys(): void
    {
        $reporter = $this->createUser('citizen', 'verified', 'citizen@example.com');
        $staff = $this->createUser('staff', 'verified', 'staff@example.com');

        $incident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'accident',
            'description' => 'Incident used to test public stats endpoint keys and values.',
            'incident_datetime' => now()->subHours(3),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'status' => 'resolved',
            'is_iot_generated' => false,
        ]);

        $incident->logs()->create([
            'changed_by' => $staff->id,
            'old_status' => 'responding',
            'new_status' => 'resolved',
            'notes' => 'Resolved for stats endpoint test.',
            'created_at' => now()->subHour(),
            'updated_at' => now()->subHour(),
        ]);

        $response = $this->getJson('/api/v1/public/stats');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'total_reported',
                    'total_resolved',
                    'active_today',
                    'avg_response_hours',
                ],
            ]);
    }

    public function test_public_verify_returns_incident_verification_data(): void
    {
        $reporter = $this->createUser('citizen', 'verified', 'citizen@example.com');

        $incident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Incident used for public verification page and QR lookup endpoint.',
            'incident_datetime' => now()->subMinutes(12),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'status' => 'verified',
            'is_iot_generated' => false,
        ]);

        $response = $this->getJson("/api/v1/public/incidents/verify/{$incident->reference_code}");

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.incident.reference_code', $incident->reference_code)
            ->assertJsonPath('data.incident.type', 'fire')
            ->assertJsonPath('data.incident.status', 'verified')
            ->assertJsonPath('data.incident.barangay', 'Poblacion')
            ->assertJsonPath('data.incident.verification_path', "/verify/{$incident->reference_code}");

        $this->assertStringStartsWith('data:image/svg+xml;base64,', (string) $response->json('data.incident.qr_code_svg'));
    }

    public function test_public_verify_returns_not_found_for_unknown_reference_code(): void
    {
        $response = $this->getJson('/api/v1/public/incidents/verify/RLK-UNKNOWNCODE123456');

        $response
            ->assertNotFound()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Incident verification record not found.');
    }

    private function createUser(string $role, string $status, string $email): User
    {
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

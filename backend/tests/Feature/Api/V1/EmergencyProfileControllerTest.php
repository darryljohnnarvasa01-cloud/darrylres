<?php

namespace Tests\Feature\Api\V1;

use App\Models\EmergencyProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmergencyProfileControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_citizen_can_create_qr_payload_for_emergency_profile(): void
    {
        $citizen = User::factory()->create([
            'role' => 'citizen',
            'status' => 'verified',
        ]);

        Sanctum::actingAs($citizen);

        $response = $this->getJson('/api/v1/profile/qr');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.profile.user_id', $citizen->id)
            ->assertJsonPath('data.profile.is_public', true)
            ->assertJsonStructure([
                'data' => [
                    'profile' => [
                        'id',
                        'user_id',
                        'qr_uuid',
                    ],
                    'qr' => [
                        'qr_uuid',
                        'public_profile_url',
                        'public_api_url',
                        'payload',
                    ],
                ],
            ]);

        $this->assertDatabaseHas('emergency_profiles', [
            'user_id' => $citizen->id,
            'is_public' => true,
        ]);
    }

    public function test_citizen_can_update_and_expose_public_safe_profile(): void
    {
        $citizen = User::factory()->create([
            'full_name' => 'Maria Santos',
            'email' => 'maria@example.com',
            'phone' => '09171234567',
            'barangay' => 'Poblacion',
            'role' => 'citizen',
            'status' => 'verified',
        ]);

        Sanctum::actingAs($citizen);

        $updateResponse = $this->patchJson('/api/v1/profile/emergency', [
            'blood_type' => 'O+',
            'allergies' => 'Penicillin',
            'medical_conditions' => 'Asthma',
            'emergency_contact_name' => 'Juan Santos',
            'emergency_contact_phone' => '09170000000',
            'is_public' => true,
        ]);

        $updateResponse
            ->assertOk()
            ->assertJsonPath('data.profile.blood_type', 'O+')
            ->assertJsonPath('data.profile.allergies', 'Penicillin')
            ->assertJsonPath('data.profile.is_public', true);

        $qrUuid = $updateResponse->json('data.profile.qr_uuid');

        $publicResponse = $this->getJson("/api/v1/public/qr/{$qrUuid}");

        $publicResponse
            ->assertOk()
            ->assertJsonPath('data.profile.full_name', 'Maria Santos')
            ->assertJsonPath('data.profile.phone', '09171234567')
            ->assertJsonPath('data.profile.blood_type', 'O+')
            ->assertJsonMissing(['email' => 'maria@example.com']);
    }

    public function test_private_profile_is_not_returned_from_public_qr_endpoint(): void
    {
        $citizen = User::factory()->create([
            'role' => 'citizen',
            'status' => 'verified',
        ]);
        $profile = EmergencyProfile::query()->create([
            'user_id' => $citizen->id,
            'is_public' => false,
            'qr_uuid' => '11111111-1111-4111-8111-111111111111',
        ]);

        $response = $this->getJson("/api/v1/public/qr/{$profile->qr_uuid}");

        $response
            ->assertNotFound()
            ->assertJsonPath('success', false);
    }
}

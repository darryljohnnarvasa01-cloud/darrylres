<?php

namespace Tests\Feature\Api\V1;

use App\Models\Incident;
use App\Models\ResponderLocation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VolunteerControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_citizen_can_register_as_available_volunteer(): void
    {
        $citizen = $this->createUser('citizen', 'verified', 'citizen@example.com');

        Sanctum::actingAs($citizen);

        $response = $this->postJson('/api/v1/volunteers/register', [
            'volunteer_skills' => ['fire', 'first_aid'],
            'volunteer_availability' => true,
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'accuracy' => 18,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.volunteer.is_volunteer', true)
            ->assertJsonPath('data.volunteer.volunteer_availability', true)
            ->assertJsonPath('data.volunteer.volunteer_skills.0', 'fire');

        $this->assertDatabaseHas('users', [
            'id' => $citizen->id,
            'is_volunteer' => true,
            'volunteer_availability' => true,
        ]);

        $this->assertDatabaseHas('responder_locations', [
            'responder_id' => $citizen->id,
            'action_status' => 'cancelled',
        ]);
    }

    public function test_nearby_returns_available_type_matched_volunteers_within_five_kilometers(): void
    {
        $admin = $this->createUser('admin', 'verified', 'admin@example.com');
        $nearVolunteer = $this->createVolunteer('near@example.com', ['fire', 'medical']);
        $farVolunteer = $this->createVolunteer('far@example.com', ['fire']);
        $wrongSkillVolunteer = $this->createVolunteer('medical@example.com', ['medical']);

        ResponderLocation::query()->create([
            'responder_id' => $nearVolunteer->id,
            'action_status' => 'cancelled',
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'recorded_at' => now(),
        ]);
        ResponderLocation::query()->create([
            'responder_id' => $farVolunteer->id,
            'action_status' => 'cancelled',
            'latitude' => 7.8000,
            'longitude' => 125.0936,
            'recorded_at' => now(),
        ]);
        ResponderLocation::query()->create([
            'responder_id' => $wrongSkillVolunteer->id,
            'action_status' => 'cancelled',
            'latitude' => 7.9063,
            'longitude' => 125.0937,
            'recorded_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/volunteers/nearby?lat=7.9062&lng=125.0936&type=fire');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.volunteers')
            ->assertJsonPath('data.volunteers.0.id', $nearVolunteer->id);
    }

    public function test_volunteer_can_accept_active_verified_incident(): void
    {
        $volunteer = $this->createVolunteer('volunteer@example.com', ['fire']);
        $reporter = $this->createUser('citizen', 'verified', 'reporter@example.com');
        $incident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Kitchen fire near the public market.',
            'incident_datetime' => now()->subMinutes(15),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'status' => 'verified',
            'is_iot_generated' => false,
        ]);

        Sanctum::actingAs($volunteer);

        $response = $this->postJson("/api/v1/volunteers/incidents/{$incident->id}/accept", [
            'latitude' => 7.9061,
            'longitude' => 125.0935,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.assignment.is_volunteer', true)
            ->assertJsonPath('data.assignment.staff.id', $volunteer->id);

        $this->assertDatabaseHas('incident_assignments', [
            'incident_id' => $incident->id,
            'staff_id' => $volunteer->id,
            'is_volunteer' => true,
        ]);
        $this->assertDatabaseHas('incident_logs', [
            'incident_id' => $incident->id,
            'changed_by' => $volunteer->id,
            'old_status' => 'verified',
            'new_status' => 'verified',
        ]);
    }

    private function createVolunteer(string $email, array $skills): User
    {
        return User::query()->create([
            'full_name' => 'Volunteer User',
            'email' => $email,
            'password' => 'password123',
            'phone' => '09170000999',
            'address' => 'Valencia City',
            'barangay' => 'Poblacion',
            'role' => 'citizen',
            'status' => 'verified',
            'is_volunteer' => true,
            'volunteer_skills' => $skills,
            'volunteer_availability' => true,
        ]);
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

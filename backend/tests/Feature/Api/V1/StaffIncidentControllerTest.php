<?php

namespace Tests\Feature\Api\V1;

use App\Events\IncidentStatusUpdated;
use App\Events\IncidentVerificationUpdated;
use App\Models\Incident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StaffIncidentControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_can_list_only_assigned_incidents(): void
    {
        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff1@example.com');
        $otherStaff = $this->createUser(role: 'staff', status: 'verified', email: 'staff2@example.com');
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        $assignedIncident = $this->createAssignedIncident($reporter, $staff, $admin, status: 'verified');
        $this->createAssignedIncident($reporter, $otherStaff, $admin, status: 'under_assessment');

        Sanctum::actingAs($staff);

        $response = $this->getJson('/api/v1/staff/incidents');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.incidents.data')
            ->assertJsonPath('data.incidents.data.0.id', $assignedIncident->id);
    }

    public function test_staff_can_only_view_detail_for_assigned_incidents(): void
    {
        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff1@example.com');
        $otherStaff = $this->createUser(role: 'staff', status: 'verified', email: 'staff2@example.com');
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        $assignedIncident = $this->createAssignedIncident($reporter, $staff, $admin, status: 'verified');
        $notAssignedIncident = $this->createAssignedIncident($reporter, $otherStaff, $admin, status: 'verified');

        Sanctum::actingAs($staff);

        $assignedResponse = $this->getJson("/api/v1/staff/incidents/{$assignedIncident->id}");
        $assignedResponse
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.incident.id', $assignedIncident->id);

        $notAssignedResponse = $this->getJson("/api/v1/staff/incidents/{$notAssignedIncident->id}");
        $notAssignedResponse
            ->assertNotFound()
            ->assertJsonPath('success', false);
    }

    public function test_staff_can_progress_status_and_create_log(): void
    {
        Event::fake([
            IncidentStatusUpdated::class,
            IncidentVerificationUpdated::class,
        ]);

        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        $incident = $this->createAssignedIncident($reporter, $staff, $admin, status: 'verified');

        Sanctum::actingAs($staff);

        $response = $this->patchJson("/api/v1/staff/incidents/{$incident->id}/status", [
            'status' => 'under_assessment',
            'notes' => 'Arrived on scene and started initial perimeter assessment.',
            'units_coordinated' => ['CDRRMO Team', 'BFP Fire Bureau'],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.incident.status', 'under_assessment');

        $this->assertDatabaseHas('incident_logs', [
            'incident_id' => $incident->id,
            'changed_by' => $staff->id,
            'old_status' => 'verified',
            'new_status' => 'under_assessment',
        ]);

        Event::assertDispatched(IncidentStatusUpdated::class);
        Event::assertNotDispatched(IncidentVerificationUpdated::class);
    }

    public function test_staff_cannot_skip_status_progression_steps(): void
    {
        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        $incident = $this->createAssignedIncident($reporter, $staff, $admin, status: 'verified');

        Sanctum::actingAs($staff);

        $response = $this->patchJson("/api/v1/staff/incidents/{$incident->id}/status", [
            'status' => 'resolved',
            'notes' => 'Tried to jump directly to resolved status in one step.',
            'units_coordinated' => [],
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $incident->refresh();
        $this->assertSame('verified', $incident->status);
        $this->assertDatabaseCount('incident_logs', 0);
    }

    public function test_resolving_incident_sets_resolved_at_notifies_citizen_and_locks_future_edits(): void
    {
        Event::fake([
            IncidentStatusUpdated::class,
            IncidentVerificationUpdated::class,
        ]);

        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        $incident = $this->createAssignedIncident($reporter, $staff, $admin, status: 'responding');

        Sanctum::actingAs($staff);

        $resolveResponse = $this->patchJson("/api/v1/staff/incidents/{$incident->id}/status", [
            'status' => 'resolved',
            'notes' => 'Fire extinguished and area cleared. Incident fully resolved.',
            'units_coordinated' => ['BFP Fire Bureau'],
        ]);

        $resolveResponse
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.incident.status', 'resolved');

        $incident->refresh();
        $this->assertNotNull($incident->resolved_at);

        Event::assertDispatched(IncidentStatusUpdated::class);
        Event::assertDispatched(IncidentVerificationUpdated::class);

        $lockedResponse = $this->patchJson("/api/v1/staff/incidents/{$incident->id}/status", [
            'status' => 'resolved',
            'notes' => 'Attempted second update after incident has been resolved.',
            'units_coordinated' => [],
        ]);

        $lockedResponse
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Incident is already resolved and cannot be updated.');
    }

    private function createAssignedIncident(
        User $reporter,
        User $staff,
        User $assignedBy,
        string $status
    ): Incident {
        $incident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Incident used in staff assignment and status progression feature tests.',
            'incident_datetime' => now()->subMinutes(20),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'status' => $status,
            'is_iot_generated' => false,
        ]);

        $incident->assignments()->create([
            'staff_id' => $staff->id,
            'assigned_by' => $assignedBy->id,
            'assigned_at' => now()->subMinutes(10),
        ]);

        return $incident;
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

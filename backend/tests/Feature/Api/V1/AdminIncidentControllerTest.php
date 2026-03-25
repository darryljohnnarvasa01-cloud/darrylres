<?php

namespace Tests\Feature\Api\V1;

use App\Events\IncidentAssignedToStaff;
use App\Events\IncidentStatusUpdated;
use App\Events\IncidentVerificationUpdated;
use App\Models\Incident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminIncidentControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_incidents_with_filters(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com', fullName: 'Juan Reporter');

        Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Fire incident that should match the filter and search criteria.',
            'incident_datetime' => now()->subMinutes(30),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
        ]);

        Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'medical',
            'description' => 'Medical incident that should be filtered out by type.',
            'incident_datetime' => now()->subMinutes(15),
            'latitude' => 7.9063,
            'longitude' => 125.0937,
            'address_label' => 'Lumbo',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/incidents?type=fire&search=Juan');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.incidents.data')
            ->assertJsonPath('data.incidents.data.0.type', 'fire');
    }

    public function test_map_endpoint_returns_only_non_resolved_incidents_by_default(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Unresolved incident for map.',
            'incident_datetime' => now()->subMinutes(20),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion',
            'status' => 'responding',
            'is_iot_generated' => false,
        ]);

        Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'medical',
            'description' => 'Resolved incident should not appear on map endpoint.',
            'incident_datetime' => now()->subMinutes(40),
            'latitude' => 7.9061,
            'longitude' => 125.0935,
            'address_label' => 'Lumbo',
            'status' => 'resolved',
            'is_iot_generated' => false,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/incidents/map');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.incidents')
            ->assertJsonPath('data.incidents.0.status', 'responding');
    }

    public function test_map_endpoint_can_filter_resolved_incidents(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'accident',
            'description' => 'Resolved accident incident should appear when filtering by resolved status.',
            'incident_datetime' => now()->subMinutes(40),
            'latitude' => 7.9061,
            'longitude' => 125.0935,
            'address_label' => 'Lumbo',
            'status' => 'resolved',
            'is_iot_generated' => false,
        ]);

        Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Unresolved incident should not appear when filtering by resolved status.',
            'incident_datetime' => now()->subMinutes(20),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion',
            'status' => 'responding',
            'is_iot_generated' => false,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/incidents/map?status=resolved');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.incidents')
            ->assertJsonPath('data.incidents.0.status', 'resolved')
            ->assertJsonPath('data.incidents.0.type', 'accident');
    }

    public function test_map_endpoint_accepts_true_string_for_today_only_filter(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        $todayIncident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Today incident should remain in filtered map results.',
            'incident_datetime' => now()->subMinutes(20),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion',
            'status' => 'responding',
            'is_iot_generated' => false,
        ]);

        $todayIncident->forceFill([
            'created_at' => now()->subMinutes(20),
            'updated_at' => now()->subMinutes(20),
        ])->saveQuietly();

        $olderIncident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Older incident should be excluded by today_only filter.',
            'incident_datetime' => now()->subDay(),
            'latitude' => 7.9061,
            'longitude' => 125.0935,
            'address_label' => 'Lumbo',
            'status' => 'verified',
            'is_iot_generated' => false,
        ]);

        $olderIncident->forceFill([
            'created_at' => now()->subDay(),
            'updated_at' => now()->subDay(),
        ])->saveQuietly();

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/incidents/map?today_only=true&types[]=fire');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.incidents')
            ->assertJsonPath('data.incidents.0.address_label', 'Poblacion');
    }

    public function test_admin_can_verify_pending_incident_assign_staff_and_log_status_change(): void
    {
        Event::fake([
            IncidentAssignedToStaff::class,
            IncidentVerificationUpdated::class,
        ]);

        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');
        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');

        $incident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Pending incident ready for admin verification and assignment.',
            'incident_datetime' => now()->subMinutes(10),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->patchJson("/api/v1/admin/incidents/{$incident->id}/verify", [
            'assigned_staff_id' => $staff->id,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.incident.status', 'verified');

        $this->assertDatabaseHas('incident_assignments', [
            'incident_id' => $incident->id,
            'staff_id' => $staff->id,
            'assigned_by' => $admin->id,
        ]);

        $this->assertDatabaseHas('incident_logs', [
            'incident_id' => $incident->id,
            'old_status' => 'pending_verification',
            'new_status' => 'verified',
        ]);

        Event::assertDispatched(IncidentAssignedToStaff::class);
        Event::assertDispatched(IncidentVerificationUpdated::class);
    }

    public function test_admin_can_reject_pending_incident_and_log_reason(): void
    {
        Event::fake([IncidentVerificationUpdated::class]);

        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        $incident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'crime',
            'description' => 'Pending incident to be rejected by administrator.',
            'incident_datetime' => now()->subMinutes(12),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->patchJson("/api/v1/admin/incidents/{$incident->id}/reject", [
            'rejection_reason' => 'Insufficient evidence and no corroborating nearby report.',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.incident.status', 'rejected');

        $this->assertDatabaseHas('incident_logs', [
            'incident_id' => $incident->id,
            'old_status' => 'pending_verification',
            'new_status' => 'rejected',
        ]);

        Event::assertDispatched(IncidentVerificationUpdated::class);
    }

    public function test_admin_can_progress_triage_status_and_log_change(): void
    {
        Event::fake([
            IncidentStatusUpdated::class,
            IncidentVerificationUpdated::class,
        ]);

        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');
        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');

        $incident = $this->createAssignedIncident($reporter, $staff, $admin, status: 'verified');

        Sanctum::actingAs($admin);

        $response = $this->patchJson("/api/v1/admin/incidents/{$incident->id}/status", [
            'status' => 'under_assessment',
            'notes' => 'Advanced from the triage board after dispatcher review.',
            'units_coordinated' => ['CDRRMO Team'],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.incident.status', 'under_assessment');

        $this->assertDatabaseHas('incident_logs', [
            'incident_id' => $incident->id,
            'changed_by' => $admin->id,
            'old_status' => 'verified',
            'new_status' => 'under_assessment',
        ]);

        Event::assertDispatched(IncidentStatusUpdated::class);
        Event::assertNotDispatched(IncidentVerificationUpdated::class);
    }

    public function test_admin_triage_status_endpoint_rejects_invalid_transition(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');
        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');

        $incident = $this->createAssignedIncident($reporter, $staff, $admin, status: 'verified');

        Sanctum::actingAs($admin);

        $response = $this->patchJson("/api/v1/admin/incidents/{$incident->id}/status", [
            'status' => 'resolved',
            'notes' => 'Attempted to skip the dispatch steps from the triage board.',
            'units_coordinated' => [],
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Invalid status progression. Next allowed status is under_assessment.');

        $incident->refresh();
        $this->assertSame('verified', $incident->status);
    }

    public function test_staff_list_endpoint_returns_verified_staff_only(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');

        $this->createUser(role: 'staff', status: 'verified', email: 'staff1@example.com', fullName: 'Staff One');
        $this->createUser(role: 'staff', status: 'pending', email: 'staff2@example.com', fullName: 'Staff Two');
        $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com', fullName: 'Citizen');

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/staff');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.staff')
            ->assertJsonPath('data.staff.0.full_name', 'Staff One');
    }

    public function test_kpi_endpoint_returns_expected_keys(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        $incident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'accident',
            'description' => 'Incident used to validate KPI response structure and fields.',
            'incident_datetime' => now()->subMinutes(25),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
        ]);

        $incident->logs()->create([
            'changed_by' => $reporter->id,
            'old_status' => null,
            'new_status' => 'responding',
            'notes' => 'Response initiated.',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/kpis');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'total_today',
                    'pending_verification',
                    'active_responding',
                    'resolved_this_month',
                    'avg_response_hours',
                ],
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

    private function createAssignedIncident(
        User $reporter,
        User $staff,
        User $assignedBy,
        string $status
    ): Incident {
        $incident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Incident used in admin triage status progression feature tests.',
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
}

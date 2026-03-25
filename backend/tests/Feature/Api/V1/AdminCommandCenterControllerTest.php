<?php

namespace Tests\Feature\Api\V1;

use App\Models\Incident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminCommandCenterControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_fetch_command_center_payload(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com', fullName: 'Admin User');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com', fullName: 'Citizen Reporter');
        $onlineStaff = $this->createUser(role: 'staff', status: 'verified', email: 'staff-online@example.com', fullName: 'Responder One');
        $offlineStaff = $this->createUser(role: 'staff', status: 'verified', email: 'staff-offline@example.com', fullName: 'Responder Two');

        $respondingIncident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Warehouse fire requiring active response.',
            'incident_datetime' => now()->subMinutes(30),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'status' => 'responding',
            'is_iot_generated' => false,
        ]);

        $respondingIncident->forceFill([
            'created_at' => now()->subMinutes(30),
            'updated_at' => now()->subMinutes(30),
        ])->save();

        $respondingIncident->assignments()->create([
            'staff_id' => $onlineStaff->id,
            'assigned_by' => $admin->id,
            'assigned_at' => now()->subMinutes(24),
        ]);

        $responseLog = $respondingIncident->logs()->create([
            'changed_by' => $admin->id,
            'old_status' => 'verified',
            'new_status' => 'responding',
            'notes' => 'Units dispatched.',
        ]);

        $responseLog->forceFill([
            'created_at' => now()->subMinutes(20),
            'updated_at' => now()->subMinutes(20),
        ])->save();

        $pendingIncident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'medical',
            'description' => 'IoT-assisted urgent medical alert.',
            'incident_datetime' => now()->subMinutes(5),
            'latitude' => 7.907,
            'longitude' => 125.094,
            'address_label' => 'Lumbo, Valencia City',
            'status' => 'pending_verification',
            'is_iot_generated' => true,
        ]);

        $pendingIncident->forceFill([
            'created_at' => now()->subMinutes(5),
            'updated_at' => now()->subMinutes(5),
        ])->save();

        $resolvedIncident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'accident',
            'description' => 'Resolved incident counted for today.',
            'incident_datetime' => now()->subHours(2),
            'latitude' => 7.9058,
            'longitude' => 125.0928,
            'address_label' => 'Bagontaas, Valencia City',
            'status' => 'resolved',
            'is_iot_generated' => false,
            'resolved_at' => now()->subHour(),
        ]);

        $resolvedIncident->forceFill([
            'created_at' => now()->subHours(2),
            'updated_at' => now()->subHour(),
        ])->save();

        $resolvedIncident->logs()->create([
            'changed_by' => $admin->id,
            'old_status' => 'verified',
            'new_status' => 'responding',
            'notes' => 'Responder dispatched.',
        ])->forceFill([
            'created_at' => now()->subMinutes(110),
            'updated_at' => now()->subMinutes(110),
        ])->save();

        $resolvedIncident->logs()->create([
            'changed_by' => $admin->id,
            'old_status' => 'responding',
            'new_status' => 'resolved',
            'notes' => 'Resolved successfully.',
        ])->forceFill([
            'created_at' => now()->subHour(),
            'updated_at' => now()->subHour(),
        ])->save();

        $onlineToken = $onlineStaff->createToken('staff-online');
        $onlineToken->accessToken->forceFill([
            'last_used_at' => now()->subMinutes(3),
            'updated_at' => now()->subMinutes(3),
        ])->save();

        $offlineToken = $offlineStaff->createToken('staff-offline');
        $offlineToken->accessToken->forceFill([
            'last_used_at' => now()->subHours(2),
            'updated_at' => now()->subHours(2),
        ])->save();

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/dashboard/command-center');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.kpis.active_incidents', 2)
            ->assertJsonPath('data.kpis.avg_response_minutes', 10)
            ->assertJsonPath('data.kpis.resolved_today', 1)
            ->assertJsonPath('data.kpis.pending_assignments', 1)
            ->assertJsonCount(2, 'data.map_incidents')
            ->assertJsonCount(3, 'data.live_feed')
            ->assertJsonPath('data.live_feed.0.reference_code', $pendingIncident->reference_code)
            ->assertJsonPath('data.live_feed.0.severity', 'critical');

        $responders = collect($response->json('data.responders'))->keyBy('full_name');

        $this->assertSame(1, $responders['Responder One']['current_assignment_count']);
        $this->assertTrue($responders['Responder One']['online']);
        $this->assertSame(0, $responders['Responder Two']['current_assignment_count']);
        $this->assertFalse($responders['Responder Two']['online']);
    }

    public function test_non_admin_cannot_fetch_command_center_payload(): void
    {
        $citizen = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com', fullName: 'Citizen User');

        Sanctum::actingAs($citizen);

        $response = $this->getJson('/api/v1/admin/dashboard/command-center');

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

<?php

namespace Tests\Feature\Admin;

use App\Models\Incident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminStaffPerformanceControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_fetch_staff_performance_metrics(): void
    {
        Carbon::setTestNow('2026-03-20 12:00:00');

        try {
            $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com', fullName: 'Admin User');
            $alpha = $this->createUser(role: 'staff', status: 'verified', email: 'alpha@example.com', fullName: 'Responder Alpha');
            $bravo = $this->createUser(role: 'staff', status: 'verified', email: 'bravo@example.com', fullName: 'Responder Bravo');
            $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com', fullName: 'Citizen Reporter');

            $resolvedIncident = Incident::query()->create([
                'reporter_id' => $reporter->id,
                'type' => 'fire',
                'description' => 'Resolved fire incident for responder performance coverage.',
                'incident_datetime' => Carbon::parse('2026-03-05 09:50:00'),
                'latitude' => 7.9062,
                'longitude' => 125.0936,
                'address_label' => 'Poblacion, Valencia City',
                'status' => 'resolved',
                'is_iot_generated' => false,
                'resolved_at' => Carbon::parse('2026-03-05 11:00:00'),
            ]);
            $resolvedIncident->forceFill([
                'created_at' => Carbon::parse('2026-03-05 09:50:00'),
                'updated_at' => Carbon::parse('2026-03-05 11:00:00'),
            ])->saveQuietly();

            $resolvedIncident->assignments()->create([
                'staff_id' => $alpha->id,
                'assigned_by' => $admin->id,
                'assigned_at' => Carbon::parse('2026-03-05 10:00:00'),
            ]);

            $resolvedResponseLog = $resolvedIncident->logs()->create([
                'changed_by' => $alpha->id,
                'old_status' => 'verified',
                'new_status' => 'under_assessment',
                'notes' => 'Responder Alpha arrived within seven minutes.',
            ]);
            $resolvedResponseLog->forceFill([
                'created_at' => Carbon::parse('2026-03-05 10:07:00'),
                'updated_at' => Carbon::parse('2026-03-05 10:07:00'),
            ])->saveQuietly();

            $resolvedFinishLog = $resolvedIncident->logs()->create([
                'changed_by' => $alpha->id,
                'old_status' => 'responding',
                'new_status' => 'resolved',
                'notes' => 'Responder Alpha resolved the incident.',
            ]);
            $resolvedFinishLog->forceFill([
                'created_at' => Carbon::parse('2026-03-05 11:00:00'),
                'updated_at' => Carbon::parse('2026-03-05 11:00:00'),
            ])->saveQuietly();

            $activeIncident = Incident::query()->create([
                'reporter_id' => $reporter->id,
                'type' => 'medical',
                'description' => 'Active medical incident for on-time and completion calculations.',
                'incident_datetime' => Carbon::parse('2026-03-10 09:40:00'),
                'latitude' => 7.9063,
                'longitude' => 125.0937,
                'address_label' => 'Lumbo, Valencia City',
                'status' => 'responding',
                'is_iot_generated' => false,
            ]);
            $activeIncident->forceFill([
                'created_at' => Carbon::parse('2026-03-10 09:40:00'),
                'updated_at' => Carbon::parse('2026-03-10 10:20:00'),
            ])->saveQuietly();

            $activeIncident->assignments()->create([
                'staff_id' => $alpha->id,
                'assigned_by' => $admin->id,
                'assigned_at' => Carbon::parse('2026-03-10 10:00:00'),
            ]);

            $activeResponseLog = $activeIncident->logs()->create([
                'changed_by' => $alpha->id,
                'old_status' => 'verified',
                'new_status' => 'under_assessment',
                'notes' => 'Responder Alpha checked in after twenty minutes.',
            ]);
            $activeResponseLog->forceFill([
                'created_at' => Carbon::parse('2026-03-10 10:20:00'),
                'updated_at' => Carbon::parse('2026-03-10 10:20:00'),
            ])->saveQuietly();

            $olderIncident = Incident::query()->create([
                'reporter_id' => $reporter->id,
                'type' => 'accident',
                'description' => 'Older completed incident for six-month chart coverage.',
                'incident_datetime' => Carbon::parse('2026-02-12 08:00:00'),
                'latitude' => 7.9064,
                'longitude' => 125.0938,
                'address_label' => 'Bagontaas, Valencia City',
                'status' => 'resolved',
                'is_iot_generated' => false,
                'resolved_at' => Carbon::parse('2026-02-12 09:00:00'),
            ]);
            $olderIncident->forceFill([
                'created_at' => Carbon::parse('2026-02-12 08:00:00'),
                'updated_at' => Carbon::parse('2026-02-12 09:00:00'),
            ])->saveQuietly();

            $olderIncident->assignments()->create([
                'staff_id' => $bravo->id,
                'assigned_by' => $admin->id,
                'assigned_at' => Carbon::parse('2026-02-12 08:05:00'),
            ]);

            $olderResponseLog = $olderIncident->logs()->create([
                'changed_by' => $bravo->id,
                'old_status' => 'verified',
                'new_status' => 'under_assessment',
                'notes' => 'Responder Bravo arrived promptly.',
            ]);
            $olderResponseLog->forceFill([
                'created_at' => Carbon::parse('2026-02-12 08:10:00'),
                'updated_at' => Carbon::parse('2026-02-12 08:10:00'),
            ])->saveQuietly();

            $olderResolvedLog = $olderIncident->logs()->create([
                'changed_by' => $bravo->id,
                'old_status' => 'responding',
                'new_status' => 'resolved',
                'notes' => 'Responder Bravo completed the older incident.',
            ]);
            $olderResolvedLog->forceFill([
                'created_at' => Carbon::parse('2026-02-12 09:00:00'),
                'updated_at' => Carbon::parse('2026-02-12 09:00:00'),
            ])->saveQuietly();

            Sanctum::actingAs($admin);

            $response = $this->getJson('/api/v1/admin/staff/performance');

            $response
                ->assertOk()
                ->assertJsonPath('success', true)
                ->assertJsonCount(2, 'data.staff')
                ->assertJsonPath('data.meta.response_sla_minutes', 15);

            $rows = collect($response->json('data.staff'));
            $alphaRow = $rows->firstWhere('id', $alpha->id);
            $bravoRow = $rows->firstWhere('id', $bravo->id);

            $this->assertSame(2, $alphaRow['incidents_handled_this_month']);
            $this->assertSame(2, $alphaRow['total_assignments']);
            $this->assertSame(1, $alphaRow['completed_incidents']);
            $this->assertSame(1, $alphaRow['current_open_assignments']);
            $this->assertEquals(13.5, (float) $alphaRow['avg_response_minutes']);
            $this->assertEquals(60.0, (float) $alphaRow['avg_resolution_minutes']);
            $this->assertEquals(50.0, (float) $alphaRow['completion_rate']);
            $this->assertEquals(50.0, (float) $alphaRow['on_time_rate']);
            $this->assertCount(2, $alphaRow['recent_incidents']);
            $this->assertSame(
                2,
                collect($alphaRow['monthly_incident_counts'])->firstWhere('month', '2026-03')['count']
            );

            $this->assertSame(0, $bravoRow['incidents_handled_this_month']);
            $this->assertSame(1, $bravoRow['total_assignments']);
            $this->assertSame(1, $bravoRow['completed_incidents']);
            $this->assertEquals(100.0, (float) $bravoRow['completion_rate']);
            $this->assertEquals(100.0, (float) $bravoRow['on_time_rate']);
            $this->assertSame(
                1,
                collect($bravoRow['monthly_incident_counts'])->firstWhere('month', '2026-02')['count']
            );
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_non_admin_cannot_fetch_staff_performance_metrics(): void
    {
        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');

        Sanctum::actingAs($staff);

        $this->getJson('/api/v1/admin/staff/performance')
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

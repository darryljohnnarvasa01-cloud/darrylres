<?php

namespace Tests\Feature\Api\V1;

use App\Models\Incident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AnalyticsControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_monthly_endpoint_returns_twelve_rows_and_counts(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        $januaryIncident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'January incident for monthly analytics endpoint test coverage.',
            'incident_datetime' => now()->subDays(10),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'status' => 'resolved',
            'is_iot_generated' => false,
        ]);
        $januaryIncident->forceFill([
            'created_at' => now()->startOfYear()->addDays(3),
            'updated_at' => now()->startOfYear()->addDays(3),
        ])->saveQuietly();

        $januaryIncident->logs()->create([
            'changed_by' => $admin->id,
            'old_status' => 'responding',
            'new_status' => 'resolved',
            'notes' => 'Resolved in January.',
        ]);
        $januaryIncident->logs()->latest()->first()->forceFill([
            'created_at' => now()->startOfYear()->addDays(4),
            'updated_at' => now()->startOfYear()->addDays(4),
        ])->saveQuietly();

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/analytics/monthly?year='.now()->year);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(12, 'data.rows')
            ->assertJsonPath('data.rows.0.month', 'Jan')
            ->assertJsonPath('data.rows.0.submitted', 1)
            ->assertJsonPath('data.rows.0.resolved', 1);
    }

    public function test_by_type_endpoint_returns_grouped_counts_for_period(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Fire incident one for by-type endpoint grouping test.',
            'incident_datetime' => now()->subDays(2),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
            'created_at' => now()->subDay(),
            'updated_at' => now()->subDay(),
        ]);

        Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Fire incident two for by-type endpoint grouping test.',
            'incident_datetime' => now()->subDays(1),
            'latitude' => 7.9063,
            'longitude' => 125.0937,
            'address_label' => 'Lumbo, Valencia City',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
            'created_at' => now()->subDay(),
            'updated_at' => now()->subDay(),
        ]);

        Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'medical',
            'description' => 'Medical incident for by-type endpoint grouping test.',
            'incident_datetime' => now()->subDays(1),
            'latitude' => 7.9064,
            'longitude' => 125.0938,
            'address_label' => 'Bagontaas, Valencia City',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
            'created_at' => now()->subDay(),
            'updated_at' => now()->subDay(),
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/analytics/by-type?from='.now()->subDays(2)->toDateString().'&to='.now()->toDateString());

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.rows.0.type', 'fire')
            ->assertJsonPath('data.rows.0.count', 2);
    }

    public function test_by_barangay_endpoint_returns_top_five_barangays(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        $addresses = [
            'Poblacion, Valencia City',
            'Poblacion, Valencia City',
            'Lumbo, Valencia City',
            'Bagontaas, Valencia City',
            'Bagontaas, Valencia City',
            'Bagontaas, Valencia City',
        ];

        foreach ($addresses as $address) {
            Incident::query()->create([
                'reporter_id' => $reporter->id,
                'type' => 'other',
                'description' => 'Incident for barangay aggregation testing.',
                'incident_datetime' => now()->subHours(12),
                'latitude' => 7.9062,
                'longitude' => 125.0936,
                'address_label' => $address,
                'status' => 'pending_verification',
                'is_iot_generated' => false,
                'created_at' => now()->subDay(),
                'updated_at' => now()->subDay(),
            ]);
        }

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/analytics/by-barangay?from='.now()->subDays(2)->toDateString().'&to='.now()->toDateString());

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.rows.0.barangay', 'Bagontaas')
            ->assertJsonPath('data.rows.0.count', 3);
    }

    public function test_kpis_endpoint_returns_expected_metrics(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        $incident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'accident',
            'description' => 'Incident for analytics KPI calculation and timeline durations.',
            'incident_datetime' => now()->subHours(5),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'status' => 'resolved',
            'is_iot_generated' => false,
            'created_at' => now()->subHours(4),
            'updated_at' => now()->subHours(4),
        ]);

        $incident->assignments()->create([
            'staff_id' => $staff->id,
            'assigned_by' => $admin->id,
            'assigned_at' => now()->subHours(3),
        ]);

        $incident->logs()->create([
            'changed_by' => $admin->id,
            'old_status' => 'pending_verification',
            'new_status' => 'verified',
            'notes' => 'Verified for KPI metrics test.',
            'created_at' => now()->subHours(3),
            'updated_at' => now()->subHours(3),
        ]);

        $incident->logs()->create([
            'changed_by' => $staff->id,
            'old_status' => 'responding',
            'new_status' => 'resolved',
            'notes' => 'Resolved for KPI metrics test.',
            'created_at' => now()->subHour(),
            'updated_at' => now()->subHour(),
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/analytics/kpis?from='.now()->subDays(3)->toDateString().'&to='.now()->toDateString());

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'avg_verification_hours',
                    'avg_resolution_hours',
                    'total_this_period',
                    'total_last_period',
                    'pct_change',
                    'active_staff_count',
                ],
            ])
            ->assertJsonPath('data.total_this_period', 1);
    }

    public function test_overview_endpoint_returns_extended_analytics_payload(): void
    {
        Carbon::setTestNow('2026-03-09 12:00:00');

        try {
            $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
            $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');
            $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

            $resolvedFire = Incident::query()->create([
                'reporter_id' => $reporter->id,
                'type' => 'fire',
                'description' => 'Resolved fire used for analytics overview response trend testing.',
                'incident_datetime' => now()->subHours(3),
                'latitude' => 7.9062,
                'longitude' => 125.0936,
                'address_label' => 'Poblacion, Valencia City',
                'status' => 'resolved',
                'is_iot_generated' => false,
            ]);
            $resolvedFire->forceFill([
                'created_at' => Carbon::parse('2026-03-09 09:00:00'),
                'updated_at' => Carbon::parse('2026-03-09 10:00:00'),
            ])->saveQuietly();

            $resolvedFire->assignments()->create([
                'staff_id' => $staff->id,
                'assigned_by' => $admin->id,
                'assigned_at' => Carbon::parse('2026-03-09 09:05:00'),
            ]);

            $resolvedFireVerifiedLog = $resolvedFire->logs()->create([
                'changed_by' => $admin->id,
                'old_status' => 'pending_verification',
                'new_status' => 'verified',
                'notes' => 'Verified for overview test.',
            ]);
            $resolvedFireVerifiedLog->forceFill([
                'created_at' => Carbon::parse('2026-03-09 09:10:00'),
                'updated_at' => Carbon::parse('2026-03-09 09:10:00'),
            ])->saveQuietly();

            $resolvedFireResponseLog = $resolvedFire->logs()->create([
                'changed_by' => $staff->id,
                'old_status' => 'verified',
                'new_status' => 'under_assessment',
                'notes' => 'Responded after 20 minutes.',
            ]);
            $resolvedFireResponseLog->forceFill([
                'created_at' => Carbon::parse('2026-03-09 09:20:00'),
                'updated_at' => Carbon::parse('2026-03-09 09:20:00'),
            ])->saveQuietly();

            $resolvedFireResolvedLog = $resolvedFire->logs()->create([
                'changed_by' => $staff->id,
                'old_status' => 'responding',
                'new_status' => 'resolved',
                'notes' => 'Resolved for overview test.',
            ]);
            $resolvedFireResolvedLog->forceFill([
                'created_at' => Carbon::parse('2026-03-09 10:00:00'),
                'updated_at' => Carbon::parse('2026-03-09 10:00:00'),
            ])->saveQuietly();

            $respondingMedical = Incident::query()->create([
                'reporter_id' => $reporter->id,
                'type' => 'medical',
                'description' => 'Responding medical incident used for unresolved risk testing.',
                'incident_datetime' => now()->subHours(2),
                'latitude' => 7.9063,
                'longitude' => 125.0937,
                'address_label' => 'Poblacion, Valencia City',
                'status' => 'responding',
                'is_iot_generated' => false,
            ]);
            $respondingMedical->forceFill([
                'created_at' => Carbon::parse('2026-03-09 10:00:00'),
                'updated_at' => Carbon::parse('2026-03-09 10:40:00'),
            ])->saveQuietly();

            $respondingMedical->assignments()->create([
                'staff_id' => $staff->id,
                'assigned_by' => $admin->id,
                'assigned_at' => Carbon::parse('2026-03-09 10:05:00'),
            ]);

            $respondingMedicalVerifiedLog = $respondingMedical->logs()->create([
                'changed_by' => $admin->id,
                'old_status' => 'pending_verification',
                'new_status' => 'verified',
                'notes' => 'Verified for overview test.',
            ]);
            $respondingMedicalVerifiedLog->forceFill([
                'created_at' => Carbon::parse('2026-03-09 10:10:00'),
                'updated_at' => Carbon::parse('2026-03-09 10:10:00'),
            ])->saveQuietly();

            $respondingMedicalResponseLog = $respondingMedical->logs()->create([
                'changed_by' => $staff->id,
                'old_status' => 'verified',
                'new_status' => 'under_assessment',
                'notes' => 'Responded after 40 minutes.',
            ]);
            $respondingMedicalResponseLog->forceFill([
                'created_at' => Carbon::parse('2026-03-09 10:40:00'),
                'updated_at' => Carbon::parse('2026-03-09 10:40:00'),
            ])->saveQuietly();

            $pendingFire = Incident::query()->create([
                'reporter_id' => $reporter->id,
                'type' => 'fire',
                'description' => 'Pending fire in Lumbo to drive type and barangay counts.',
                'incident_datetime' => now()->subDay(),
                'latitude' => 7.9064,
                'longitude' => 125.0938,
                'address_label' => 'Lumbo, Valencia City',
                'status' => 'pending_verification',
                'is_iot_generated' => false,
            ]);
            $pendingFire->forceFill([
                'created_at' => Carbon::parse('2026-03-08 23:00:00'),
                'updated_at' => Carbon::parse('2026-03-08 23:00:00'),
            ])->saveQuietly();

            Sanctum::actingAs($admin);

            $response = $this->getJson('/api/v1/admin/analytics/overview?from=2026-03-01&to=2026-03-09');

            $response
                ->assertOk()
                ->assertJsonPath('success', true)
                ->assertJsonCount(30, 'data.response_time_trend')
                ->assertJsonPath('data.type_breakdown.0.type', 'fire')
                ->assertJsonPath('data.type_breakdown.0.count', 2)
                ->assertJsonPath('data.barangay_risk_rows.0.barangay', 'Poblacion')
                ->assertJsonPath('data.barangay_risk_rows.0.total_incidents', 2)
                ->assertJsonPath('data.barangay_risk_rows.0.unresolved_count', 1)
                ->assertJsonPath('data.barangay_risk_rows.0.risk_score', 1.6)
                ->assertJsonCount(168, 'data.time_of_day_heatmap')
                ->assertJsonCount(3, 'data.incident_rows');

            $trendRows = collect($response->json('data.response_time_trend'));
            $todayTrend = $trendRows->firstWhere('date', '2026-03-09');
            $this->assertEquals(30.0, (float) $todayTrend['avg_response_minutes']);
            $this->assertSame(2, $todayTrend['responded_count']);

            $heatmapRows = collect($response->json('data.time_of_day_heatmap'));
            $mondayNineAm = $heatmapRows->first(fn (array $row) => $row['day_index'] === 1 && $row['hour'] === 9);
            $this->assertSame(1, $mondayNineAm['count']);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_export_incidents_streams_csv_download(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com', fullName: 'Reporter One');

        Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Incident row included in CSV export endpoint test.',
            'incident_datetime' => now()->subHours(2),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
            'created_at' => now()->subDay(),
            'updated_at' => now()->subDay(),
        ]);

        Sanctum::actingAs($admin);

        $response = $this->get('/api/v1/admin/incidents/export?format=csv');

        $response->assertOk();
        $this->assertStringContainsString(
            'text/csv',
            strtolower((string) $response->headers->get('content-type'))
        );

        $csv = $response->streamedContent();

        $this->assertStringContainsString('ID,Type,Description,Barangay', $csv);
        $this->assertStringContainsString('"Reporter Name"', $csv);
        $this->assertStringContainsString('"IoT Generated"', $csv);
        $this->assertStringContainsString('Reporter One', $csv);
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

<?php

namespace Tests\Feature\Admin;

use App\Models\AuditLog;
use App\Models\Incident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminAuditLogControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_filter_and_paginate_audit_logs(): void
    {
        Carbon::setTestNow('2026-03-20 14:00:00');

        try {
            $viewer = $this->createUser(role: 'admin', status: 'verified', email: 'viewer@example.com', fullName: 'Viewer Admin');
            $actor = $this->createUser(role: 'admin', status: 'verified', email: 'actor@example.com', fullName: 'Actor Admin');
            $otherActor = $this->createUser(role: 'admin', status: 'verified', email: 'other@example.com', fullName: 'Other Admin');
            $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com', fullName: 'Citizen Reporter');

            $incident = Incident::query()->create([
                'reporter_id' => $reporter->id,
                'type' => 'fire',
                'description' => 'Audit log incident for filter coverage.',
                'incident_datetime' => Carbon::parse('2026-03-18 10:00:00'),
                'latitude' => 7.9062,
                'longitude' => 125.0936,
                'address_label' => 'Poblacion, Valencia City',
                'status' => 'verified',
                'is_iot_generated' => false,
            ]);

            $matchingLog = AuditLog::query()->create([
                'user_id' => $actor->id,
                'incident_id' => $incident->id,
                'action_type' => 'incident.verify',
                'entity_type' => 'Incident',
                'entity_id' => $incident->id,
                'before_state' => ['status' => 'pending_verification'],
                'after_state' => ['status' => 'verified'],
                'metadata' => ['assigned_staff_name' => 'Responder Alpha'],
            ]);
            $matchingLog->forceFill([
                'created_at' => Carbon::parse('2026-03-18 10:15:00'),
                'updated_at' => Carbon::parse('2026-03-18 10:15:00'),
            ])->saveQuietly();

            $otherLog = AuditLog::query()->create([
                'user_id' => $otherActor->id,
                'action_type' => 'registration.approve',
                'entity_type' => 'User',
                'entity_id' => $reporter->id,
                'before_state' => ['status' => 'pending'],
                'after_state' => ['status' => 'verified'],
                'metadata' => [],
            ]);
            $otherLog->forceFill([
                'created_at' => Carbon::parse('2026-03-19 08:00:00'),
                'updated_at' => Carbon::parse('2026-03-19 08:00:00'),
            ])->saveQuietly();

            Sanctum::actingAs($viewer);

            $response = $this->getJson('/api/v1/admin/audit-logs?user_id='.$actor->id.'&action_type=incident.verify&incident_id='.$incident->id.'&from=2026-03-18&to=2026-03-18&per_page=5');

            $response
                ->assertOk()
                ->assertJsonPath('success', true)
                ->assertJsonCount(1, 'data.logs.data')
                ->assertJsonPath('data.logs.data.0.id', $matchingLog->id)
                ->assertJsonPath('data.logs.data.0.action_type', 'incident.verify')
                ->assertJsonPath('data.logs.data.0.user.id', $actor->id)
                ->assertJsonPath('data.logs.data.0.incident.id', $incident->id);

            $actionTypes = $response->json('data.filters.action_types');
            $this->assertContains('incident.verify', $actionTypes);
            $this->assertContains('registration.approve', $actionTypes);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_admin_can_export_filtered_audit_logs_as_csv(): void
    {
        $viewer = $this->createUser(role: 'admin', status: 'verified', email: 'viewer@example.com', fullName: 'Viewer Admin');
        $actor = $this->createUser(role: 'admin', status: 'verified', email: 'actor@example.com', fullName: 'Actor Admin');

        AuditLog::query()->create([
            'user_id' => $actor->id,
            'action_type' => 'iot_device.create',
            'entity_type' => 'IotDevice',
            'entity_id' => 'device-001',
            'before_state' => [],
            'after_state' => ['device_id' => 'device-001'],
            'metadata' => ['api_key_generated' => true],
        ]);

        Sanctum::actingAs($viewer);

        $response = $this->get('/api/v1/admin/audit-logs?action_type=iot_device.create&format=csv');

        $response->assertOk();
        $this->assertStringContainsString(
            'text/csv',
            strtolower((string) $response->headers->get('content-type'))
        );

        $csv = $response->streamedContent();

        $this->assertStringContainsString('Action Type', $csv);
        $this->assertStringContainsString('iot_device.create', $csv);
        $this->assertStringContainsString('Actor Admin', $csv);
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

<?php

namespace Tests\Feature\Api\V1;

use App\Events\IncidentAssignedToStaff;
use App\Events\IncidentStatusUpdated;
use App\Events\IncidentVerificationUpdated;
use App\Events\IotSmokeAlert;
use App\Events\NewIncidentSubmitted;
use App\Events\RegistrationSubmitted;
use App\Models\Incident;
use App\Models\IotDevice;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationListenersTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_incident_submitted_creates_notifications_for_all_admins(): void
    {
        $adminOne = $this->createUser(role: 'admin', status: 'verified', email: 'admin1@example.com');
        $adminTwo = $this->createUser(role: 'admin', status: 'verified', email: 'admin2@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com', fullName: 'Juan Reporter');

        $incident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Incident used to test admin notification listener for new submissions.',
            'incident_datetime' => now()->subMinutes(5),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion',
            'status' => 'pending_verification',
            'is_iot_generated' => false,
        ]);

        event(new NewIncidentSubmitted($incident));

        $this->assertDatabaseHas('notifications', [
            'user_id' => $adminOne->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $adminTwo->id,
        ]);
    }

    public function test_incident_assigned_event_creates_notification_for_staff(): void
    {
        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        $incident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'medical',
            'description' => 'Incident used to test staff assignment notification listener.',
            'incident_datetime' => now()->subMinutes(5),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Lumbo',
            'status' => 'verified',
            'is_iot_generated' => false,
        ]);

        event(IncidentAssignedToStaff::fromIncident($incident, $staff));

        $this->assertDatabaseHas('notifications', [
            'user_id' => $staff->id,
            'link' => "/staff/incidents/{$incident->id}",
        ]);
    }

    public function test_iot_smoke_alert_creates_notifications_for_all_admins(): void
    {
        $adminOne = $this->createUser(role: 'admin', status: 'verified', email: 'admin1@example.com');
        $adminTwo = $this->createUser(role: 'admin', status: 'verified', email: 'admin2@example.com');

        $device = IotDevice::query()->create([
            'device_id' => 'SMOKE-101',
            'location_name' => 'Sayre Highway',
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'smoke_threshold' => 300,
            'api_key' => 'hashed-key',
            'is_active' => true,
        ]);

        $incident = Incident::query()->create([
            'reporter_id' => null,
            'type' => 'fire',
            'description' => 'Automated smoke alert incident.',
            'incident_datetime' => now()->subMinute(),
            'latitude' => $device->latitude,
            'longitude' => $device->longitude,
            'address_label' => $device->location_name,
            'status' => 'pending_verification',
            'is_iot_generated' => true,
            'device_id' => $device->device_id,
        ]);

        event(new IotSmokeAlert($device, $incident, 450));

        $this->assertDatabaseHas('notifications', [
            'user_id' => $adminOne->id,
            'link' => "/admin/incidents?incident={$incident->id}",
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $adminTwo->id,
            'link' => "/admin/incidents?incident={$incident->id}",
        ]);
    }

    public function test_verification_update_event_creates_notification_for_citizen(): void
    {
        $citizen = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');
        $incident = Incident::query()->create([
            'reporter_id' => $citizen->id,
            'type' => 'crime',
            'description' => 'Incident used to test citizen verification notifications.',
            'incident_datetime' => now()->subMinutes(5),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Bagontaas',
            'status' => 'verified',
            'is_iot_generated' => false,
        ]);

        event(IncidentVerificationUpdated::forUser(
            $citizen->id,
            $incident,
            "Your report #{$incident->id} has been verified."
        ));

        $this->assertDatabaseHas('notifications', [
            'user_id' => $citizen->id,
            'link' => "/my-reports?incident={$incident->id}",
        ]);
    }

    public function test_resolved_status_update_creates_admin_and_citizen_notifications(): void
    {
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');
        $citizen = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');

        $incident = Incident::query()->create([
            'reporter_id' => $citizen->id,
            'type' => 'accident',
            'description' => 'Incident used to test resolved status notification listener.',
            'incident_datetime' => now()->subMinutes(5),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion',
            'status' => 'resolved',
            'is_iot_generated' => false,
        ]);

        event(new IncidentStatusUpdated(
            $incident,
            $staff,
            'responding',
            'resolved',
            'Incident has been fully resolved on site.'
        ));

        $this->assertDatabaseHas('notifications', [
            'user_id' => $admin->id,
            'link' => "/admin/incidents?incident={$incident->id}",
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $citizen->id,
            'link' => "/my-reports?incident={$incident->id}",
        ]);
        $this->assertSame(2, Notification::query()->count());
    }

    public function test_registration_submitted_creates_notifications_for_all_admins(): void
    {
        $adminOne = $this->createUser(role: 'admin', status: 'verified', email: 'admin1@example.com');
        $adminTwo = $this->createUser(role: 'admin', status: 'verified', email: 'admin2@example.com');
        $citizen = $this->createUser(
            role: 'citizen',
            status: 'pending',
            email: 'pending@example.com',
            fullName: 'Pending Applicant'
        );

        event(RegistrationSubmitted::fromUser($citizen));

        $this->assertDatabaseHas('notifications', [
            'user_id' => $adminOne->id,
            'link' => '/admin/registrations',
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $adminTwo->id,
            'link' => '/admin/registrations',
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
}

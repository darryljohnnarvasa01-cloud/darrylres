<?php

namespace Tests\Feature\Api\V1;

use App\Events\RegistrationApproved;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminRegistrationControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_registrations_by_status_with_signed_gov_id_url(): void
    {
        Storage::fake('private');

        $admin = $this->createAdminUser();
        $pending = $this->createCitizenUser([
            'email' => 'pending@example.com',
            'status' => 'pending',
            'gov_id_image_path' => 'gov_ids/pending-id.jpg',
        ]);
        Storage::disk('private')->put('gov_ids/pending-id.jpg', 'fake-image-content');

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/registrations?status=pending');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.registrations.data.0.id', $pending->id)
            ->assertJsonPath('data.registrations.data.0.email', 'pending@example.com');

        $govIdUrl = $response->json('data.registrations.data.0.gov_id_url');
        $this->assertIsString($govIdUrl);
        $this->assertStringContainsString('/api/v1/admin/gov-id/pending-id.jpg', $govIdUrl);
    }

    public function test_non_admin_cannot_list_registrations(): void
    {
        $citizen = $this->createCitizenUser([
            'email' => 'citizen@example.com',
            'status' => 'verified',
        ]);

        Sanctum::actingAs($citizen);

        $response = $this->getJson('/api/v1/admin/registrations');

        $response
            ->assertForbidden()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'You are not allowed to access this resource.');
    }

    public function test_admin_without_manage_users_permission_cannot_list_registrations(): void
    {
        $admin = $this->createAdminUser([
            'role_permissions' => [
                'manage-users' => false,
                'manage-incidents' => true,
                'view-analytics' => true,
                'manage-iot' => true,
                'broadcast-messages' => true,
            ],
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/registrations');

        $response
            ->assertForbidden()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'You do not have permission to access this resource.');
    }

    public function test_admin_can_approve_pending_registration_and_dispatch_event(): void
    {
        Event::fake([RegistrationApproved::class]);

        $admin = $this->createAdminUser();
        $pending = $this->createCitizenUser([
            'status' => 'pending',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->patchJson("/api/v1/admin/registrations/{$pending->id}/approve");

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'verified');

        $this->assertDatabaseHas('users', [
            'id' => $pending->id,
            'status' => 'verified',
            'rejection_reason' => null,
        ]);

        Event::assertDispatched(RegistrationApproved::class);
    }

    public function test_admin_can_reject_registration_with_reason(): void
    {
        $admin = $this->createAdminUser();
        $pending = $this->createCitizenUser([
            'status' => 'pending',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->patchJson("/api/v1/admin/registrations/{$pending->id}/reject", [
            'rejection_reason' => 'Submitted ID does not match registration details.',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.rejection_reason', 'Submitted ID does not match registration details.');

        $this->assertDatabaseHas('users', [
            'id' => $pending->id,
            'status' => 'rejected',
            'rejection_reason' => 'Submitted ID does not match registration details.',
        ]);
    }

    public function test_admin_reject_requires_rejection_reason(): void
    {
        $admin = $this->createAdminUser();
        $pending = $this->createCitizenUser([
            'status' => 'pending',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->patchJson("/api/v1/admin/registrations/{$pending->id}/reject", []);

        $response
            ->assertUnprocessable()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Validation failed.')
            ->assertJsonStructure([
                'errors' => [
                    'rejection_reason',
                ],
            ]);
    }

    public function test_admin_can_access_gov_id_file_only_with_signed_url(): void
    {
        Storage::fake('private');

        $admin = $this->createAdminUser();
        $this->createCitizenUser([
            'status' => 'pending',
            'gov_id_image_path' => 'gov_ids/sample-id.jpg',
        ]);
        Storage::disk('private')->put('gov_ids/sample-id.jpg', 'fake-image-content');

        Sanctum::actingAs($admin);

        $registrationsResponse = $this->getJson('/api/v1/admin/registrations?status=pending');
        $signedUrl = $registrationsResponse->json('data.registrations.data.0.gov_id_url');

        $signedResponse = $this->get($signedUrl);
        $signedResponse->assertOk();

        $unsignedResponse = $this->get('/api/v1/admin/gov-id/sample-id.jpg');
        $unsignedResponse->assertForbidden();
    }

    public function test_unauthenticated_gov_id_request_returns_json_401_instead_of_server_error(): void
    {
        Storage::fake('private');

        $this->createCitizenUser([
            'status' => 'pending',
            'gov_id_image_path' => 'gov_ids/sample-id.jpg',
        ]);
        Storage::disk('private')->put('gov_ids/sample-id.jpg', 'fake-image-content');

        $signedUrl = URL::temporarySignedRoute(
            'admin.gov-id.show',
            now()->addMinutes(30),
            ['filename' => 'sample-id.jpg'],
            absolute: false
        );

        $response = $this->getJson($signedUrl);

        $response
            ->assertUnauthorized()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Unauthenticated.');
    }

    private function createAdminUser(array $overrides = []): User
    {
        return User::query()->create(array_merge([
            'full_name' => 'CDRRMO Admin',
            'email' => 'admin@example.com',
            'password' => 'password123',
            'phone' => '09170000100',
            'address' => 'Valencia City',
            'barangay' => 'Poblacion',
            'role' => 'admin',
            'status' => 'verified',
        ], $overrides));
    }

    private function createCitizenUser(array $overrides = []): User
    {
        return User::query()->create(array_merge([
            'full_name' => 'Sample Citizen',
            'email' => 'citizen'.uniqid('', true).'@example.com',
            'password' => 'password123',
            'phone' => '09170000200',
            'address' => 'Valencia City',
            'barangay' => 'Poblacion',
            'role' => 'citizen',
            'status' => 'pending',
        ], $overrides));
    }
}

<?php

namespace Tests\Feature\Api\V1;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_creates_pending_citizen_and_stores_gov_id(): void
    {
        Storage::fake('private');

        $response = $this->postJson('/api/v1/auth/register', [
            'full_name' => 'Juan Dela Cruz',
            'email' => 'juan@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'phone' => '09171234567',
            'address' => 'Purok 1, Valencia City',
            'barangay' => 'Poblacion',
            'gov_id_image' => UploadedFile::fake()->image('gov-id.jpg'),
        ]);

        $response
            ->assertCreated()
            ->assertJson([
                'success' => true,
                'message' => 'Registration submitted. Awaiting admin approval.',
            ]);

        $user = User::query()->where('email', 'juan@example.com')->first();

        $this->assertNotNull($user);
        $this->assertSame('citizen', $user->role);
        $this->assertSame('pending', $user->status);
        $this->assertNotNull($user->gov_id_image_path);
        Storage::disk('private')->assertExists($user->gov_id_image_path);
    }

    public function test_register_validates_missing_government_id_image(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'full_name' => 'Juan Dela Cruz',
            'email' => 'juan@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'phone' => '09171234567',
            'address' => 'Purok 1, Valencia City',
            'barangay' => 'Poblacion',
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Validation failed.')
            ->assertJsonStructure([
                'errors' => [
                    'gov_id_image',
                ],
            ]);
    }

    public function test_login_blocks_pending_citizen_accounts(): void
    {
        User::query()->create([
            'full_name' => 'Pending Citizen',
            'email' => 'pending@example.com',
            'password' => 'password123',
            'phone' => '09170000001',
            'address' => 'Valencia City',
            'barangay' => 'Poblacion',
            'role' => 'citizen',
            'status' => 'pending',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'pending@example.com',
            'password' => 'password123',
        ]);

        $response
            ->assertForbidden()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Account is pending approval.');
    }

    public function test_login_blocks_rejected_citizen_accounts_with_reason(): void
    {
        User::query()->create([
            'full_name' => 'Rejected Citizen',
            'email' => 'rejected@example.com',
            'password' => 'password123',
            'phone' => '09170000002',
            'address' => 'Valencia City',
            'barangay' => 'Poblacion',
            'role' => 'citizen',
            'status' => 'rejected',
            'rejection_reason' => 'Government ID image is unreadable.',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'rejected@example.com',
            'password' => 'password123',
        ]);

        $response
            ->assertForbidden()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Account was rejected: Government ID image is unreadable.');
    }

    public function test_login_returns_token_for_verified_account(): void
    {
        User::query()->create([
            'full_name' => 'Verified Citizen',
            'email' => 'verified@example.com',
            'password' => 'password123',
            'phone' => '09170000003',
            'address' => 'Valencia City',
            'barangay' => 'Poblacion',
            'role' => 'citizen',
            'status' => 'verified',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'verified@example.com',
            'password' => 'password123',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.email', 'verified@example.com')
            ->assertJsonPath('data.user.role', 'citizen')
            ->assertJsonPath('data.user.permissions', [])
            ->assertJsonStructure([
                'data' => [
                    'user',
                    'token',
                    'role',
                ],
            ]);
    }

    public function test_me_returns_authenticated_user_with_permissions(): void
    {
        $admin = User::query()->create([
            'full_name' => 'CDRRMO Admin',
            'email' => 'admin@example.com',
            'password' => 'password123',
            'phone' => '09170000004',
            'address' => 'Valencia City',
            'barangay' => 'Poblacion',
            'role' => 'admin',
            'status' => 'verified',
            'role_permissions' => [
                'manage-users' => true,
                'manage-incidents' => false,
                'view-analytics' => true,
                'manage-iot' => false,
                'broadcast-messages' => true,
            ],
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/auth/me');

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.email', 'admin@example.com')
            ->assertJsonPath('data.user.permissions.0', 'manage-users')
            ->assertJsonPath('data.user.permission_map.manage-incidents', false)
            ->assertJsonPath('data.role', 'admin');
    }

    public function test_logout_revokes_current_token(): void
    {
        User::query()->create([
            'full_name' => 'Verified Citizen',
            'email' => 'verified@example.com',
            'password' => 'password123',
            'phone' => '09170000003',
            'address' => 'Valencia City',
            'barangay' => 'Poblacion',
            'role' => 'citizen',
            'status' => 'verified',
        ]);

        $loginResponse = $this->postJson('/api/v1/auth/login', [
            'email' => 'verified@example.com',
            'password' => 'password123',
        ]);

        $token = $loginResponse->json('data.token');

        $logoutResponse = $this
            ->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/auth/logout');

        $logoutResponse
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Logged out successfully.');

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }
}

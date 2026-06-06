<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\RegistrationSubmitted;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Models\Sanctum\PersonalAccessToken;
use App\Models\User;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    use ApiResponse;

    public function register(RegisterRequest $request)
    {
        $validated = $request->validated();

        $govIdFile = $request->file('gov_id_image');
        $filename = Str::uuid()->toString().'.'.$govIdFile->getClientOriginalExtension();
        $storedPath = Storage::disk(config('filesystems.government_id_disk', 'private'))
            ->putFileAs('gov_ids', $govIdFile, $filename);

        $user = User::create([
            'full_name' => $validated['full_name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
            'phone' => $validated['phone'],
            'address' => $validated['address'],
            'barangay' => $validated['barangay'],
            'role' => 'citizen',
            'status' => 'pending',
            'gov_id_image_path' => $storedPath,
        ]);

        event(RegistrationSubmitted::fromUser($user));

        return $this->successResponse(
            ['id' => $user->id],
            'Registration submitted. Awaiting admin approval.',
            201
        );
    }

    public function login(LoginRequest $request)
    {
        $validated = $request->validated();

        $user = User::query()->where('email', $validated['email'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            return $this->errorResponse(
                'Invalid credentials.',
                ['email' => ['The provided credentials are incorrect.']],
                401
            );
        }

        if ($user->role === 'citizen' && $user->status === 'pending') {
            return $this->errorResponse('Account is pending approval.', [], 403);
        }

        if ($user->role === 'citizen' && $user->status === 'rejected') {
            $reason = $user->rejection_reason ?: 'No reason provided.';

            return $this->errorResponse("Account was rejected: {$reason}", [], 403);
        }

        $newToken = $user->createToken('auth_token');
        $token = $newToken->plainTextToken;

        if ($newToken->accessToken instanceof PersonalAccessToken) {
            $newToken->accessToken->setRelation('tokenable', $user);
            PersonalAccessToken::rememberPlainTextToken($token, $newToken->accessToken);
        }

        return $this->successResponse([
            'user' => $this->serializeUser($user),
            'token' => $token,
            'role' => $this->clientRole($user),
        ], 'Login successful.');
    }

    public function me(Request $request)
    {
        $user = $request->user();

        return $this->successResponse([
            'user' => $this->serializeUser($user),
            'role' => $this->clientRole($user),
        ], 'Authenticated user retrieved successfully.');
    }

    public function logout(Request $request)
    {
        PersonalAccessToken::forgetPlainTextToken($request->bearerToken());

        $request->user()?->currentAccessToken()?->delete();

        return $this->successResponse([], 'Logged out successfully.');
    }

    private function serializeUser(User $user): array
    {
        return [
            'id' => $user->id,
            'full_name' => $user->full_name,
            'email' => $user->email,
            'phone' => $user->phone,
            'address' => $user->address,
            'barangay' => $user->barangay,
            'role' => $this->clientRole($user),
            'actual_role' => $user->role,
            'admin_role' => $user->adminRole ? [
                'id' => $user->adminRole->id,
                'name' => $user->adminRole->name,
            ] : null,
            'status' => $user->status,
            'permissions' => $user->permissionList(),
            'permission_map' => $user->permissionMap(),
            'is_volunteer' => (bool) $user->is_volunteer,
            'volunteer_skills' => is_array($user->volunteer_skills) ? $user->volunteer_skills : [],
            'volunteer_availability' => (bool) $user->volunteer_availability,
        ];
    }

    private function clientRole(User $user): string
    {
        // If user is actually an admin, return admin regardless of fallback logic
        if ($user->role === 'admin') {
            return 'admin';
        }

        // Use fallback access for staff when no admins exist
        return $user->canUseFallbackAdminAccess() ? 'admin' : $user->role;
    }
}

<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\RegistrationSubmitted;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
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
        $storedPath = Storage::disk('private')->putFileAs('gov_ids', $govIdFile, $filename);

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

        $token = $user->createToken('auth_token')->plainTextToken;

        return $this->successResponse([
            'user' => $this->serializeUser($user),
            'token' => $token,
            'role' => $user->role,
        ], 'Login successful.');
    }

    public function me(Request $request)
    {
        $user = $request->user();

        return $this->successResponse([
            'user' => $this->serializeUser($user),
            'role' => $user->role,
        ], 'Authenticated user retrieved successfully.');
    }

    public function logout(Request $request)
    {
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
            'role' => $user->role,
            'status' => $user->status,
            'permissions' => $user->permissionList(),
            'permission_map' => $user->permissionMap(),
        ];
    }
}

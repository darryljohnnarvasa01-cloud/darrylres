<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Events\RegistrationApproved;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\RegistrationRejectRequest;
use App\Models\User;
use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Facades\Validator;

class AdminRegistrationController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'status' => ['nullable', 'in:pending,verified,rejected'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $validated = $validator->validated();

        $status = $validated['status'] ?? 'pending';
        $perPage = $validated['per_page'] ?? 15;

        $registrations = User::query()
            ->where('role', 'citizen')
            ->when($status, fn ($query) => $query->where('status', $status))
            ->orderByDesc('created_at')
            ->paginate($perPage)
            ->withQueryString();

        $registrations->getCollection()->transform(function (User $user) {
            $filename = $user->gov_id_image_path ? basename($user->gov_id_image_path) : null;

            return [
                'id' => $user->id,
                'full_name' => $user->full_name,
                'email' => $user->email,
                'phone' => $user->phone,
                'address' => $user->address,
                'barangay' => $user->barangay,
                'role' => $user->role,
                'status' => $user->status,
                'rejection_reason' => $user->rejection_reason,
                'submitted_at' => $user->created_at?->toIso8601String(),
                'gov_id_url' => $filename
                    ? URL::temporarySignedRoute(
                        'admin.gov-id.show',
                        now()->addMinutes(30),
                        ['filename' => $filename],
                        absolute: false
                    )
                    : null,
            ];
        });

        return $this->successResponse(['registrations' => $registrations], 'Registrations fetched.');
    }

    public function approve(Request $request, User $user)
    {
        if ($user->role !== 'citizen') {
            return $this->errorResponse('Registration not found.', [], 404);
        }

        $before = $this->registrationAuditSnapshot($user);

        $user->update([
            'status' => 'verified',
            'rejection_reason' => null,
        ]);

        AuditLogger::record(
            $request->user(),
            'registration.approve',
            $user,
            $before,
            $this->registrationAuditSnapshot($user),
            metadata: [
                'target_role' => $user->role,
            ],
        );

        event(RegistrationApproved::fromUser($user));

        return $this->successResponse([
            'id' => $user->id,
            'status' => $user->status,
        ], 'Registration approved.');
    }

    public function reject(RegistrationRejectRequest $request, User $user)
    {
        if ($user->role !== 'citizen') {
            return $this->errorResponse('Registration not found.', [], 404);
        }

        $before = $this->registrationAuditSnapshot($user);

        $user->update([
            'status' => 'rejected',
            'rejection_reason' => $request->validated('rejection_reason'),
        ]);

        AuditLogger::record(
            $request->user(),
            'registration.reject',
            $user,
            $before,
            $this->registrationAuditSnapshot($user),
            metadata: [
                'target_role' => $user->role,
            ],
        );

        return $this->successResponse([
            'id' => $user->id,
            'status' => $user->status,
            'rejection_reason' => $user->rejection_reason,
        ], 'Registration rejected.');
    }

    public function showGovId(Request $request, string $filename)
    {
        if (! $request->hasValidSignature(false)) {
            return $this->errorResponse('Invalid or expired file URL.', [], 403);
        }

        $path = 'gov_ids/'.$filename;

        if (! Storage::disk('private')->exists($path)) {
            return $this->errorResponse('File not found.', [], 404);
        }

        return response()->file(Storage::disk('private')->path($path), [
            'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
        ]);
    }

    private function registrationAuditSnapshot(User $user): array
    {
        return [
            'full_name' => $user->full_name,
            'email' => $user->email,
            'barangay' => $user->barangay,
            'role' => $user->role,
            'status' => $user->status,
            'rejection_reason' => $user->rejection_reason,
        ];
    }
}

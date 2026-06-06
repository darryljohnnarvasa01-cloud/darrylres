<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\CreateStaffRequest;
use App\Models\User;
use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\Cache;

class AdminStaffController extends Controller
{
    use ApiResponse;

    public function store(CreateStaffRequest $request)
    {
        $validated = $request->validated();

        $staff = User::create([
            'full_name' => $validated['full_name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
            'phone' => $validated['phone'],
            'address' => $validated['address'],
            'barangay' => $validated['barangay'],
            'role' => 'staff',
            'status' => 'verified',
        ]);

        AuditLogger::record(
            $request->user(),
            'staff.create',
            $staff,
            [],
            $this->staffAuditSnapshot($staff),
            metadata: [
                'target_role' => $staff->role,
            ],
        );

        Cache::forget('admin.staff_performance.v3');
        Cache::forget('admin.verified_staff.v2');
        Cache::forget('admin.command_center.snapshot.v4');

        return $this->successResponse([
            'staff' => $this->serializeStaff($staff),
        ], 'Staff account created.', 201);
    }

    private function serializeStaff(User $staff): array
    {
        return [
            'id' => $staff->id,
            'full_name' => $staff->full_name,
            'email' => $staff->email,
            'phone' => $staff->phone,
            'address' => $staff->address,
            'barangay' => $staff->barangay,
            'role' => $staff->role,
            'status' => $staff->status,
            'created_at' => $staff->created_at?->toIso8601String(),
        ];
    }

    private function staffAuditSnapshot(User $staff): array
    {
        return [
            'full_name' => $staff->full_name,
            'email' => $staff->email,
            'phone' => $staff->phone,
            'address' => $staff->address,
            'barangay' => $staff->barangay,
            'role' => $staff->role,
            'status' => $staff->status,
        ];
    }
}

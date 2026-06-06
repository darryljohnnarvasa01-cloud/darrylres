<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class AdminRoleController extends Controller
{
    use ApiResponse;

    public function index()
    {
        $roles = Role::query()
            ->withCount('users')
            ->orderBy('name')
            ->get()
            ->map(fn (Role $role) => $this->serializeRole($role));

        $admins = User::query()
            ->with('adminRole')
            ->where('role', 'admin')
            ->orderBy('full_name')
            ->get()
            ->map(fn (User $user) => $this->serializeAdminUser($user));

        return $this->successResponse([
            'abilities' => User::ADMIN_ABILITIES,
            'roles' => $roles,
            'admins' => $admins,
            'full_admin_count' => User::fullAdminCount(),
        ], 'Roles fetched.');
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:120', 'unique:roles,name'],
            'permissions' => ['required', 'array'],
            'permissions.*' => ['boolean'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $validated = $validator->validated();
        $role = Role::create([
            'name' => $validated['name'],
            'slug' => $this->uniqueSlug($validated['name']),
            'permissions' => Role::normalizedPermissions($validated['permissions']),
            'is_system' => false,
            'is_active' => true,
        ]);

        AuditLogger::record($request->user(), 'role.create', $role, [], $this->roleAuditSnapshot($role));

        return $this->successResponse(['role' => $this->serializeRole($role)], 'Role created.', 201);
    }

    public function update(Request $request, Role $role)
    {
        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:120', Rule::unique('roles', 'name')->ignore($role->id)],
            'permissions' => ['required', 'array'],
            'permissions.*' => ['boolean'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $validated = $validator->validated();
        $before = $this->roleAuditSnapshot($role);
        $nextPermissions = Role::normalizedPermissions($validated['permissions']);
        $nextActive = (bool) ($validated['is_active'] ?? $role->is_active);

        if (! $nextActive && $this->wouldRemoveLastFullAdmin($role, $nextPermissions, false)) {
            return $this->errorResponse('At least one full admin must remain active.', [
                'role' => ['Disabling this role would lock out full admin access.'],
            ], 422);
        }

        if ($role->is_system && $role->slug === Role::SUPER_ADMIN_SLUG && ! collect($nextPermissions)->every(fn (bool $allowed) => $allowed)) {
            return $this->errorResponse('The Super Admin role must keep every permission.', [
                'permissions' => ['System full-admin permissions cannot be reduced.'],
            ], 422);
        }

        $role->update([
            'name' => $validated['name'],
            'permissions' => $nextPermissions,
            'is_active' => $nextActive,
        ]);

        AuditLogger::record($request->user(), 'role.update', $role, $before, $this->roleAuditSnapshot($role));

        return $this->successResponse(['role' => $this->serializeRole($role->fresh('users'))], 'Role updated.');
    }

    public function destroy(Request $request, Role $role)
    {
        if ($role->is_system) {
            return $this->errorResponse('System roles cannot be deleted.', [
                'role' => ['Disable non-system roles instead of deleting system roles.'],
            ], 422);
        }

        if ($this->wouldRemoveLastFullAdmin($role, $role->permissionMap(), false)) {
            return $this->errorResponse('At least one full admin must remain active.', [
                'role' => ['Deleting this role would lock out full admin access.'],
            ], 422);
        }

        if ($role->users()->exists()) {
            $before = $this->roleAuditSnapshot($role);
            $role->update(['is_active' => false]);
            AuditLogger::record($request->user(), 'role.disable', $role, $before, $this->roleAuditSnapshot($role));

            return $this->successResponse(['role' => $this->serializeRole($role)], 'Role disabled because users are assigned to it.');
        }

        $before = $this->roleAuditSnapshot($role);
        $role->delete();
        AuditLogger::record($request->user(), 'role.delete', $role, $before, []);

        return $this->successResponse([], 'Role deleted.');
    }

    public function assign(Request $request, User $user)
    {
        if ($user->role !== 'admin') {
            return $this->errorResponse('Only admin users can receive admin roles.', [
                'user' => ['The selected user is not an admin.'],
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'role_id' => ['required', 'uuid', 'exists:roles,id'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $role = Role::query()->findOrFail($validator->validated()['role_id']);

        if (! $role->is_active) {
            return $this->errorResponse('Inactive roles cannot be assigned.', [
                'role_id' => ['Choose an active role.'],
            ], 422);
        }

        if ($user->isFullAdmin() && ! $role->grantsFullAdmin() && User::fullAdminCount() <= 1) {
            return $this->errorResponse('At least one full admin must remain active.', [
                'role_id' => ['Assigning this role would remove the last full admin.'],
            ], 422);
        }

        $before = $this->userAuditSnapshot($user);
        $user->update([
            'role_id' => $role->id,
            'role_permissions' => null,
        ]);
        $user->load('adminRole');

        AuditLogger::record($request->user(), 'role.assign', $user, $before, $this->userAuditSnapshot($user));

        return $this->successResponse(['admin' => $this->serializeAdminUser($user)], 'Admin role assigned.');
    }

    public function createAdmin(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'full_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'phone' => ['required', 'string', 'max:20'],
            'address' => ['required', 'string'],
            'barangay' => ['required', 'string'],
            'role_id' => ['required', 'uuid', 'exists:roles,id'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $validated = $validator->validated();
        $role = Role::query()->findOrFail($validated['role_id']);

        if (! $role->is_active) {
            return $this->errorResponse('Inactive roles cannot be assigned.', [
                'role_id' => ['Choose an active role.'],
            ], 422);
        }

        $admin = User::create([
            'full_name' => $validated['full_name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
            'phone' => $validated['phone'],
            'address' => $validated['address'],
            'barangay' => $validated['barangay'],
            'role' => 'admin',
            'status' => 'verified',
            'role_id' => $role->id,
        ]);

        $admin->load('adminRole');

        AuditLogger::record($request->user(), 'admin.create', $admin, [], $this->userAuditSnapshot($admin));

        return $this->successResponse(['admin' => $this->serializeAdminUser($admin)], 'Admin account created.', 201);
    }

    private function wouldRemoveLastFullAdmin(Role $role, array $nextPermissions, bool $nextActive): bool
    {
        $roleCurrentlyGrantsFullAdmin = $role->is_active && $role->grantsFullAdmin();
        $roleWouldGrantFullAdmin = $nextActive && collect($nextPermissions)->every(fn (bool $allowed) => $allowed);

        if (! $roleCurrentlyGrantsFullAdmin || $roleWouldGrantFullAdmin) {
            return false;
        }

        $fullAdminsOutsideRole = User::query()
            ->where('role', 'admin')
            ->where('status', 'verified')
            ->where(function ($query) use ($role) {
                $query->whereNull('role_id')->orWhere('role_id', '!=', $role->id);
            })
            ->get()
            ->filter(fn (User $user) => $user->isFullAdmin())
            ->count();

        return $fullAdminsOutsideRole === 0 && $role->users()->where('role', 'admin')->exists();
    }

    private function uniqueSlug(string $name): string
    {
        $base = Role::slugFromName($name);
        $slug = $base;
        $counter = 2;

        while (Role::query()->where('slug', $slug)->exists()) {
            $slug = "{$base}-{$counter}";
            $counter++;
        }

        return $slug;
    }

    private function serializeRole(Role $role): array
    {
        return [
            'id' => $role->id,
            'name' => $role->name,
            'slug' => $role->slug,
            'permissions' => $role->permissionList(),
            'permission_map' => $role->permissionMap(),
            'is_system' => $role->is_system,
            'is_active' => $role->is_active,
            'users_count' => $role->users_count ?? $role->users()->count(),
            'created_at' => $role->created_at?->toIso8601String(),
            'updated_at' => $role->updated_at?->toIso8601String(),
        ];
    }

    private function serializeAdminUser(User $user): array
    {
        return [
            'id' => $user->id,
            'full_name' => $user->full_name,
            'email' => $user->email,
            'status' => $user->status,
            'role_id' => $user->role_id,
            'role_name' => $user->adminRole?->name ?? 'Legacy Admin',
            'permissions' => $user->permissionList(),
            'is_full_admin' => $user->isFullAdmin(),
        ];
    }

    private function roleAuditSnapshot(Role $role): array
    {
        return [
            'name' => $role->name,
            'slug' => $role->slug,
            'permissions' => $role->permissionMap(),
            'is_active' => $role->is_active,
            'is_system' => $role->is_system,
        ];
    }

    private function userAuditSnapshot(User $user): array
    {
        return [
            'full_name' => $user->full_name,
            'email' => $user->email,
            'role' => $user->role,
            'role_id' => $user->role_id,
            'role_name' => $user->adminRole?->name,
            'permissions' => $user->permissionList(),
        ];
    }
}

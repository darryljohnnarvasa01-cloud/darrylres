<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, HasUuids, Notifiable, SoftDeletes;

    public const ADMIN_ABILITIES = [
        'view-dashboard',
        'manage-users',
        'manage-roles',
        'manage-incidents',
        'view-analytics',
        'view-reports',
        'manage-iot',
        'broadcast-messages',
        'edit-system-settings',
        'delete-records',
    ];

    public const FALLBACK_ADMIN_ROLES = ['staff'];

    protected $keyType = 'string';

    public $incrementing = false;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'full_name',
        'email',
        'password',
        'phone',
        'address',
        'barangay',
        'role',
        'status',
        'role_permissions',
        'role_id',
        'gov_id_image_path',
        'rejection_reason',
        'is_volunteer',
        'volunteer_skills',
        'volunteer_availability',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'role_permissions' => 'array',
            'is_volunteer' => 'boolean',
            'volunteer_skills' => 'array',
            'volunteer_availability' => 'boolean',
        ];
    }

    public static function defaultAdminPermissions(): array
    {
        return collect(self::ADMIN_ABILITIES)
            ->mapWithKeys(fn (string $ability) => [$ability => true])
            ->all();
    }

    public function permissionMap(): array
    {
        if ($this->canUseFallbackAdminAccess()) {
            return self::defaultAdminPermissions();
        }

        if ($this->role !== 'admin') {
            return [];
        }

        if ($this->adminRole && $this->adminRole->is_active) {
            return $this->adminRole->permissionMap();
        }

        $stored = is_array($this->role_permissions) ? $this->role_permissions : [];

        if ($stored === []) {
            return self::defaultAdminPermissions();
        }

        return collect(self::ADMIN_ABILITIES)
            ->mapWithKeys(fn (string $ability) => [$ability => (bool) ($stored[$ability] ?? false)])
            ->all();
    }

    /**
     * @return array<int, string>
     */
    public function permissionList(): array
    {
        return collect($this->permissionMap())
            ->filter()
            ->keys()
            ->values()
            ->all();
    }

    public function hasAbility(string $ability): bool
    {
        return (bool) ($this->permissionMap()[$ability] ?? false);
    }

    public function canAccessAdminPanel(): bool
    {
        return $this->role === 'admin' || $this->canUseFallbackAdminAccess();
    }

    public function canUseFallbackAdminAccess(): bool
    {
        if (! in_array($this->role, self::FALLBACK_ADMIN_ROLES, true)) {
            return false;
        }

        return ! self::query()
            ->where('role', 'admin')
            ->where('status', 'verified')
            ->exists();
    }

    public function isFullAdmin(): bool
    {
        if ($this->role !== 'admin' || $this->status !== 'verified') {
            return false;
        }

        return collect($this->permissionMap())->every(fn (bool $allowed) => $allowed);
    }

    public static function fullAdminCount(): int
    {
        return self::query()
            ->where('role', 'admin')
            ->where('status', 'verified')
            ->get()
            ->filter(fn (User $user) => $user->isFullAdmin())
            ->count();
    }

    public function adminRole(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    public function reportedIncidents(): HasMany
    {
        return $this->hasMany(Incident::class, 'reporter_id');
    }

    public function incidentLogs(): HasMany
    {
        return $this->hasMany(IncidentLog::class, 'changed_by');
    }

    public function incidentAssignments(): HasMany
    {
        return $this->hasMany(IncidentAssignment::class, 'staff_id');
    }

    public function emergencyProfile(): HasOne
    {
        return $this->hasOne(EmergencyProfile::class);
    }

    public function responderLocations(): HasMany
    {
        return $this->hasMany(ResponderLocation::class, 'responder_id');
    }

    public function responderStatusLogs(): HasMany
    {
        return $this->hasMany(ResponderStatusLog::class, 'responder_id');
    }

    public function assignmentsCreated(): HasMany
    {
        return $this->hasMany(IncidentAssignment::class, 'assigned_by');
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    public function emailNotifications(): HasMany
    {
        return $this->hasMany(EmailNotification::class);
    }

    public function conversations(): BelongsToMany
    {
        return $this->belongsToMany(Conversation::class, 'conversation_participants');
    }

    public function sentMessages(): HasMany
    {
        return $this->hasMany(Message::class, 'sender_id');
    }

    public function receivedMessages(): HasMany
    {
        return $this->hasMany(Message::class, 'recipient_id');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, HasUuids, Notifiable;

    public const ADMIN_ABILITIES = [
        'manage-users',
        'manage-incidents',
        'view-analytics',
        'manage-iot',
        'broadcast-messages',
    ];

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
        'gov_id_image_path',
        'rejection_reason',
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
        if ($this->role !== 'admin') {
            return [];
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

    public function assignmentsCreated(): HasMany
    {
        return $this->hasMany(IncidentAssignment::class, 'assigned_by');
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }
}

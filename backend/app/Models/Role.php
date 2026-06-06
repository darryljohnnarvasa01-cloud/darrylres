<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Role extends Model
{
    use HasFactory, HasUuids;

    public const SUPER_ADMIN_SLUG = 'super-admin';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'name',
        'slug',
        'permissions',
        'is_system',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'permissions' => 'array',
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public static function slugFromName(string $name): string
    {
        return Str::slug($name) ?: Str::uuid()->toString();
    }

    public static function normalizedPermissions(array $permissions): array
    {
        $allowed = array_fill_keys(User::ADMIN_ABILITIES, false);

        foreach ($permissions as $key => $value) {
            if (is_int($key)) {
                $allowed[$value] = true;
                continue;
            }

            $allowed[$key] = (bool) $value;
        }

        return collect($allowed)
            ->only(User::ADMIN_ABILITIES)
            ->map(fn ($allowed) => (bool) $allowed)
            ->all();
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function permissionList(): array
    {
        return collect($this->permissionMap())
            ->filter()
            ->keys()
            ->values()
            ->all();
    }

    public function permissionMap(): array
    {
        return self::normalizedPermissions(is_array($this->permissions) ? $this->permissions : []);
    }

    public function grantsFullAdmin(): bool
    {
        return collect($this->permissionMap())->every(fn (bool $allowed) => $allowed);
    }
}

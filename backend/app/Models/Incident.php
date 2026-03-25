<?php

namespace App\Models;

use App\Support\IncidentVerification;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Incident extends Model
{
    use HasFactory, HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'reference_code',
        'reporter_id',
        'type',
        'description',
        'incident_datetime',
        'latitude',
        'longitude',
        'address_label',
        'status',
        'is_iot_generated',
        'device_id',
        'rejection_reason',
        'resolved_at',
    ];

    protected $appends = [
        'verification_path',
        'verification_url',
    ];

    protected function casts(): array
    {
        return [
            'incident_datetime' => 'datetime',
            'is_iot_generated' => 'boolean',
            'latitude' => 'float',
            'longitude' => 'float',
            'resolved_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $incident): void {
            if (empty($incident->id)) {
                $incident->id = (string) Str::uuid();
            }

            if (empty($incident->reference_code)) {
                $incident->reference_code = IncidentVerification::referenceCodeFromId((string) $incident->id);
            }
        });
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reporter_id');
    }

    public function media(): HasMany
    {
        return $this->hasMany(IncidentMedia::class);
    }

    public function logs(): HasMany
    {
        return $this->hasMany(IncidentLog::class)->orderBy('created_at');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(IncidentAssignment::class)->orderByDesc('created_at');
    }

    public function getVerificationPathAttribute(): ?string
    {
        if (! $this->reference_code) {
            return null;
        }

        return IncidentVerification::verificationPath((string) $this->reference_code);
    }

    public function getVerificationUrlAttribute(): ?string
    {
        if (! $this->reference_code) {
            return null;
        }

        return IncidentVerification::verificationUrl((string) $this->reference_code);
    }
}

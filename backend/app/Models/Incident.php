<?php

namespace App\Models;

use App\Support\IncidentVerification;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Incident extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'reference_code',
        'client_uuid',
        'reporter_id',
        'is_guest',
        'guest_identifier',
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
        'ai_risk_score',
    ];

    protected $appends = [
        'verification_path',
        'verification_url',
    ];

    protected function casts(): array
    {
        return [
            'incident_datetime' => 'datetime',
            'is_guest' => 'boolean',
            'is_iot_generated' => 'boolean',
            'latitude' => 'float',
            'longitude' => 'float',
            'resolved_at' => 'datetime',
            'ai_risk_score' => 'integer',
            'confirmations_count' => 'integer',
            'disputes_count' => 'integer',
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

    public function feedbackRatings(): HasMany
    {
        return $this->hasMany(FeedbackRating::class);
    }

    public function incidentConfirmations(): HasMany
    {
        return $this->hasMany(IncidentConfirmation::class);
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    public function latestAssignment(): HasOne
    {
        return $this->hasOne(IncidentAssignment::class)
            ->where('is_volunteer', false)
            ->orderByDesc('assigned_at')
            ->orderByDesc('created_at');
    }

    public function responderLocations(): HasMany
    {
        return $this->hasMany(ResponderLocation::class);
    }

    public function responderStatusLogs(): HasMany
    {
        return $this->hasMany(ResponderStatusLog::class);
    }

    public function getVerificationPathAttribute(): ?string
    {
        if (! $this->reference_code) {
            return null;
        }

        return IncidentVerification::verificationPath((string) $this->reference_code);
    }

    public function credibilityBadge(): ?string
    {
        $confirmations = (int) ($this->confirmations_count ?? 0);
        $disputes = (int) ($this->disputes_count ?? 0);

        if ($confirmations >= 10) {
            return 'Highly Credible';
        }

        if ($confirmations >= 5) {
            return 'Credible';
        }

        if ($confirmations >= 3) {
            return 'Likely Credible';
        }

        if ($disputes >= 3 && $confirmations === 0) {
            return 'Disputed';
        }

        if ($disputes >= 1 && $confirmations === 0) {
            return 'Under Review';
        }

        return null;
    }

    public function getVerificationUrlAttribute(): ?string
    {
        if (! $this->reference_code) {
            return null;
        }

        return IncidentVerification::verificationUrl((string) $this->reference_code);
    }
}

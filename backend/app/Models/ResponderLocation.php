<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ResponderLocation extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    public const ACTION_STATUSES = [
        'accepted_request',
        'on_the_way',
        'arrived',
        'resolved',
        'cancelled',
    ];

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'responder_id',
        'incident_id',
        'action_status',
        'latitude',
        'longitude',
        'accuracy',
        'heading',
        'battery_level',
        'metadata',
        'recorded_at',
    ];

    protected function casts(): array
    {
        return [
            'latitude' => 'float',
            'longitude' => 'float',
            'accuracy' => 'float',
            'heading' => 'float',
            'battery_level' => 'integer',
            'metadata' => 'array',
            'recorded_at' => 'datetime',
        ];
    }

    public function responder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responder_id');
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class);
    }
}

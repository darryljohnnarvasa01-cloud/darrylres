<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BroadcastMessage extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'broadcasts';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'title',
        'message',
        'link',
        'target_type',
        'target_barangay',
        'target_polygon',
        'sent_by',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'target_polygon' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by');
    }

    public function recipients(): HasMany
    {
        return $this->hasMany(BroadcastRecipient::class, 'broadcast_id');
    }
}

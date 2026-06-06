<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class HazardZone extends Model
{
    use HasFactory, HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    public const TYPES = ['danger', 'flood', 'evacuation'];

    protected $fillable = [
        'name',
        'type',
        'polygon',
        'description',
        'capacity',
        'current_occupancy',
        'facilities',
        'is_active',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'polygon' => 'array',
            'capacity' => 'integer',
            'current_occupancy' => 'integer',
            'facilities' => 'array',
            'is_active' => 'boolean',
            'created_at' => 'datetime',
        ];
    }
}

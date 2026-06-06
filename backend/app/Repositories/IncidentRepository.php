<?php

namespace App\Repositories;

use App\Models\Incident;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class IncidentRepository
{
    /**
     * @param  array<int, string>  $statuses
     * @return Collection<int, Incident>
     */
    public function commandCenterMap(array $statuses, int $limit = 250): Collection
    {
        return $this->summaryQuery()
            ->whereIn('status', $statuses)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();
    }

    /**
     * @return Collection<int, Incident>
     */
    public function commandCenterLiveFeed(int $limit = 10): Collection
    {
        return $this->summaryQuery()
            ->where('status', '!=', 'rejected')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();
    }

    public function summaryQuery(): Builder
    {
        return Incident::query()
            ->with([
                'reporter:id,full_name,email,phone,barangay',
                'latestAssignment.staff:id,full_name,email,phone,barangay,role,status',
            ])
            ->select([
                'id',
                'reference_code',
                'reporter_id',
                'is_guest',
                'type',
                'status',
                'latitude',
                'longitude',
                'address_label',
                'description',
                'is_iot_generated',
                'device_id',
                'incident_datetime',
                'created_at',
                'resolved_at',
            ]);
    }
}

<?php

namespace App\Support;

use App\Models\Incident;
use App\Models\User;

class IncidentStatusProgression
{
    private const STATUS_FLOW = [
        'verified' => 'under_assessment',
        'under_assessment' => 'responding',
        'responding' => 'resolved',
    ];

    public static function expectedNextStatus(string $currentStatus): ?string
    {
        return self::STATUS_FLOW[$currentStatus] ?? null;
    }

    /**
     * @param  array<int, string>  $unitsCoordinated
     * @return array<string, mixed>
     */
    public static function progress(
        Incident $incident,
        User $actor,
        string $newStatus,
        string $notes,
        array $unitsCoordinated = []
    ): array {
        if ($incident->status === 'resolved' || $incident->resolved_at !== null) {
            return ['error' => 'locked'];
        }

        $expectedNextStatus = self::expectedNextStatus((string) $incident->status);

        if (! $expectedNextStatus || $newStatus !== $expectedNextStatus) {
            return [
                'error' => 'invalid_transition',
                'expected_status' => $expectedNextStatus,
            ];
        }

        $oldStatus = (string) $incident->status;

        $updatePayload = [
            'status' => $newStatus,
        ];

        if ($newStatus === 'resolved') {
            $updatePayload['resolved_at'] = now();
        }

        $incident->update($updatePayload);

        $incident->logs()->create([
            'changed_by' => $actor->id,
            'old_status' => $oldStatus,
            'new_status' => $newStatus,
            'notes' => $notes,
            'units_coordinated' => empty($unitsCoordinated) ? null : $unitsCoordinated,
        ]);

        return [
            'incident_id' => $incident->id,
            'old_status' => $oldStatus,
            'new_status' => $newStatus,
        ];
    }
}

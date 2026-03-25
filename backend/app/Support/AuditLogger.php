<?php

namespace App\Support;

use App\Models\AuditLog;
use App\Models\Incident;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class AuditLogger
{
    public static function record(
        ?User $user,
        string $actionType,
        Model|array|string|null $subject = null,
        array $before = [],
        array $after = [],
        ?Incident $incident = null,
        array $metadata = [],
    ): AuditLog {
        [$entityType, $entityId] = self::resolveSubject($subject);

        return AuditLog::query()->create([
            'user_id' => $user?->id,
            'incident_id' => $incident?->id ?? ($subject instanceof Incident ? $subject->id : null),
            'action_type' => $actionType,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'before_state' => self::normalize($before),
            'after_state' => self::normalize($after),
            'metadata' => self::normalize($metadata),
        ]);
    }

    /**
     * @return array{0: ?string, 1: ?string}
     */
    private static function resolveSubject(Model|array|string|null $subject): array
    {
        if ($subject instanceof Model) {
            return [
                class_basename($subject),
                (string) $subject->getKey(),
            ];
        }

        if (is_array($subject)) {
            return [
                $subject['entity_type'] ?? null,
                isset($subject['entity_id']) ? (string) $subject['entity_id'] : null,
            ];
        }

        if (is_string($subject) && $subject !== '') {
            return [$subject, null];
        }

        return [null, null];
    }

    private static function normalize(mixed $value): mixed
    {
        if ($value instanceof Carbon) {
            return $value->toIso8601String();
        }

        if ($value instanceof Model) {
            return self::normalize($value->toArray());
        }

        if (is_array($value)) {
            $normalized = [];

            foreach ($value as $key => $item) {
                $normalized[$key] = self::normalize($item);
            }

            return $normalized;
        }

        return $value;
    }
}

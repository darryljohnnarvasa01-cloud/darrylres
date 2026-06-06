<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ResponderHealthLogResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'responder_id' => $this->responder_id,
            'incident_id' => $this->incident_id,
            'event_type' => $this->event_type,
            'severity' => $this->severity,
            'payload' => $this->payload,
            'recorded_at' => $this->recorded_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'incident' => $this->whenLoaded('incident', fn () => $this->incident ? [
                'id' => $this->incident->id,
                'reference_code' => $this->incident->reference_code,
            ] : null),
        ];
    }
}

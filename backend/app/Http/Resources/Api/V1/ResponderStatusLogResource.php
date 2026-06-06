<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ResponderStatusLogResource extends JsonResource
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
            'action_status' => $this->action_status,
            'notes' => $this->notes,
            'latitude' => $this->latitude === null ? null : (float) $this->latitude,
            'longitude' => $this->longitude === null ? null : (float) $this->longitude,
            'created_at' => $this->created_at?->toIso8601String(),
            'responder' => $this->whenLoaded('responder', fn () => $this->responder ? [
                'id' => $this->responder->id,
                'full_name' => $this->responder->full_name,
                'phone' => $this->responder->phone,
                'barangay' => $this->responder->barangay,
            ] : null),
        ];
    }
}

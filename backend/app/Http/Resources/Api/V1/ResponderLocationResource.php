<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ResponderLocationResource extends JsonResource
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
            'latitude' => (float) $this->latitude,
            'longitude' => (float) $this->longitude,
            'accuracy' => $this->accuracy === null ? null : (float) $this->accuracy,
            'heading' => $this->heading === null ? null : (float) $this->heading,
            'battery_level' => $this->battery_level,
            'recorded_at' => $this->recorded_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'responder' => $this->whenLoaded('responder', fn () => $this->responder ? [
                'id' => $this->responder->id,
                'full_name' => $this->responder->full_name,
                'email' => $this->responder->email,
                'phone' => $this->responder->phone,
                'barangay' => $this->responder->barangay,
                'role' => $this->responder->role,
                'status' => $this->responder->status,
            ] : null),
            'incident' => $this->whenLoaded('incident', fn () => $this->incident ? [
                'id' => $this->incident->id,
                'reference_code' => $this->incident->reference_code,
                'type' => $this->incident->type,
                'status' => $this->incident->status,
                'address_label' => $this->incident->address_label,
                'latitude' => (float) $this->incident->latitude,
                'longitude' => (float) $this->incident->longitude,
            ] : null),
        ];
    }
}

<?php

namespace App\Http\Resources\Api\V1;

use App\Models\IncidentAssignment;
use App\Support\IncidentVerification;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class IncidentSummaryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $assignment = $this->relationLoaded('latestAssignment')
            ? $this->latestAssignment
            : $this->whenLoaded('assignments', fn () => $this->assignments->first());
        $feedback = $this->relationLoaded('feedbackRatings')
            ? $this->feedbackRatings->first()
            : null;

        if (! $assignment instanceof IncidentAssignment) {
            $assignment = null;
        }

        return [
            'id' => $this->id,
            'reference_code' => $this->reference_code,
            'type' => $this->type,
            'status' => $this->status,
            'is_guest' => (bool) $this->is_guest,
            'latitude' => (float) $this->latitude,
            'longitude' => (float) $this->longitude,
            'address_label' => $this->address_label,
            'barangay' => IncidentVerification::extractBarangay((string) $this->address_label),
            'description' => $this->when(array_key_exists('description', $this->getAttributes()), $this->description),
            'is_iot_generated' => (bool) $this->is_iot_generated,
            'device_id' => $this->device_id,
            'ai_risk_score' => $this->when(array_key_exists('ai_risk_score', $this->getAttributes()), (int) $this->ai_risk_score),
            'incident_datetime' => $this->incident_datetime?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'resolved_at' => $this->resolved_at?->toIso8601String(),
            'feedback_submitted' => $this->when($this->relationLoaded('feedbackRatings'), $feedback !== null),
            'feedback' => $this->when($feedback !== null, fn () => [
                'id' => $feedback->id,
                'rating' => (int) $feedback->rating,
                'comment' => $feedback->comment,
                'created_at' => $feedback->created_at?->toIso8601String(),
            ]),
            'reporter' => $this->whenLoaded('reporter', fn () => $this->reporter ? [
                'id' => $this->reporter->id,
                'full_name' => $this->reporter->full_name,
                'email' => $this->reporter->email,
                'phone' => $this->reporter->phone,
                'barangay' => $this->reporter->barangay,
            ] : null),
            'confirmations_count' => $this->when(array_key_exists('confirmations_count', $this->getAttributes()), (int) $this->confirmations_count),
            'disputes_count' => $this->when(array_key_exists('disputes_count', $this->getAttributes()), (int) $this->disputes_count),
            'credibility_badge' => $this->when(array_key_exists('confirmations_count', $this->getAttributes()), fn () => $this->credibilityBadge()),
            'assigned_responder' => $assignment?->staff?->full_name,
            'assignments' => $assignment ? [[
                'id' => $assignment->id,
                'is_volunteer' => (bool) $assignment->is_volunteer,
                'assigned_at' => $assignment->assigned_at?->toIso8601String(),
                'staff' => $assignment->staff ? [
                    'id' => $assignment->staff->id,
                    'full_name' => $assignment->staff->full_name,
                    'email' => $assignment->staff->email,
                    'phone' => $assignment->staff->phone,
                    'barangay' => $assignment->staff->barangay,
                    'role' => $assignment->staff->role,
                    'status' => $assignment->staff->status,
                    'is_volunteer' => (bool) $assignment->staff->is_volunteer,
                ] : null,
            ]] : [],
        ];
    }
}

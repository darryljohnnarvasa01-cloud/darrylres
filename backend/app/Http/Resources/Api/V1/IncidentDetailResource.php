<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class IncidentDetailResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $feedback = $this->relationLoaded('feedbackRatings')
            ? $this->feedbackRatings->first()
            : null;

        return [
            'id' => $this->id,
            'reference_code' => $this->reference_code,
            'type' => $this->type,
            'description' => $this->description,
            'incident_datetime' => $this->incident_datetime?->toIso8601String(),
            'latitude' => (float) $this->latitude,
            'longitude' => (float) $this->longitude,
            'address_label' => $this->address_label,
            'status' => $this->status,
            'is_guest' => (bool) $this->is_guest,
            'is_iot_generated' => (bool) $this->is_iot_generated,
            'device_id' => $this->device_id,
            'rejection_reason' => $this->rejection_reason,
            'resolved_at' => $this->resolved_at?->toIso8601String(),
            'ai_risk_score' => $this->when(array_key_exists('ai_risk_score', $this->getAttributes()), (int) $this->ai_risk_score),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'verification_path' => $this->verification_path,
            'verification_url' => $this->verification_url,
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
                'address' => $this->reporter->address,
                'barangay' => $this->reporter->barangay,
                'role' => $this->reporter->role,
                'status' => $this->reporter->status,
                'emergency_profile' => $this->reporter->relationLoaded('emergencyProfile') && $this->reporter->emergencyProfile ? [
                    'id' => $this->reporter->emergencyProfile->id,
                    'emergency_contact_name' => $this->reporter->emergencyProfile->emergency_contact_name,
                    'emergency_contact_phone' => $this->reporter->emergencyProfile->emergency_contact_phone,
                    'is_public' => (bool) $this->reporter->emergencyProfile->is_public,
                ] : null,
            ] : null),
            'media' => $this->whenLoaded('media', fn () => $this->media->map(fn ($media) => [
                'id' => $media->id,
                'incident_id' => $media->incident_id,
                'file_path' => $media->file_path,
                'file_type' => $media->file_type,
                'file_url' => $media->file_url,
                'created_at' => $media->created_at?->toIso8601String(),
            ])->values()),
            'assignments' => $this->whenLoaded('assignments', fn () => $this->assignments->map(fn ($assignment) => [
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
                'assigned_by' => $assignment->assignedBy ? [
                    'id' => $assignment->assignedBy->id,
                    'full_name' => $assignment->assignedBy->full_name,
                    'role' => $assignment->assignedBy->role,
                ] : null,
            ])->values()),
            'logs' => $this->whenLoaded('logs', fn () => $this->logs->map(fn ($log) => [
                'id' => $log->id,
                'incident_id' => $log->incident_id,
                'old_status' => $log->old_status,
                'new_status' => $log->new_status,
                'notes' => $log->notes,
                'units_coordinated' => $log->units_coordinated,
                'created_at' => $log->created_at?->toIso8601String(),
                'changed_by_user' => $log->changedByUser ? [
                    'id' => $log->changedByUser->id,
                    'full_name' => $log->changedByUser->full_name,
                    'role' => $log->changedByUser->role,
                ] : null,
            ])->values()),
        ];
    }
}

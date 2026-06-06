<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Profile\UpdateEmergencyProfileRequest;
use App\Models\EmergencyProfile;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class EmergencyProfileController extends Controller
{
    use ApiResponse;

    public function showQr(Request $request)
    {
        $profile = $this->profileForUser($request);

        return $this->successResponse([
            'profile' => $this->profilePayload($profile),
            'qr' => $this->qrPayload($profile),
        ], 'Emergency profile QR data retrieved successfully.');
    }

    public function update(UpdateEmergencyProfileRequest $request)
    {
        $profile = $this->profileForUser($request);
        $validated = $request->validated();

        $profile->fill([
            'blood_type' => $validated['blood_type'] ?? null,
            'allergies' => $validated['allergies'] ?? null,
            'medical_conditions' => $validated['medical_conditions'] ?? null,
            'emergency_contact_name' => $validated['emergency_contact_name'] ?? null,
            'emergency_contact_phone' => $validated['emergency_contact_phone'] ?? null,
            'is_public' => (bool) $validated['is_public'],
        ])->save();

        return $this->successResponse([
            'profile' => $this->profilePayload($profile->refresh()),
            'qr' => $this->qrPayload($profile),
        ], 'Emergency profile saved successfully.');
    }

    public function publicShow(string $qrUuid)
    {
        $profile = EmergencyProfile::query()
            ->with('user:id,full_name,phone,barangay')
            ->where('qr_uuid', $qrUuid)
            ->where('is_public', true)
            ->first();

        if (! $profile) {
            return $this->errorResponse('Emergency profile is unavailable or private.', [], 404);
        }

        return $this->successResponse([
            'profile' => $this->publicProfilePayload($profile),
        ], 'Emergency profile retrieved successfully.');
    }

    private function profileForUser(Request $request): EmergencyProfile
    {
        $user = $request->user();

        return EmergencyProfile::query()->firstOrCreate(
            ['user_id' => $user->id],
            [
                'qr_uuid' => (string) Str::uuid(),
                'is_public' => true,
            ],
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function profilePayload(EmergencyProfile $profile): array
    {
        return [
            'id' => $profile->id,
            'user_id' => $profile->user_id,
            'blood_type' => $profile->blood_type,
            'allergies' => $profile->allergies,
            'medical_conditions' => $profile->medical_conditions,
            'emergency_contact_name' => $profile->emergency_contact_name,
            'emergency_contact_phone' => $profile->emergency_contact_phone,
            'is_public' => (bool) $profile->is_public,
            'qr_uuid' => $profile->qr_uuid,
            'created_at' => $profile->created_at?->toIso8601String(),
            'updated_at' => $profile->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function publicProfilePayload(EmergencyProfile $profile): array
    {
        return [
            'qr_uuid' => $profile->qr_uuid,
            'full_name' => $profile->user?->full_name,
            'phone' => $profile->user?->phone,
            'barangay' => $profile->user?->barangay,
            'blood_type' => $profile->blood_type,
            'allergies' => $profile->allergies,
            'medical_conditions' => $profile->medical_conditions,
            'emergency_contact_name' => $profile->emergency_contact_name,
            'emergency_contact_phone' => $profile->emergency_contact_phone,
            'updated_at' => $profile->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function qrPayload(EmergencyProfile $profile): array
    {
        $frontendBase = rtrim((string) config('app.frontend_url'), '/');
        $apiBase = rtrim((string) config('app.url'), '/');
        $publicProfileUrl = "{$frontendBase}/qr/{$profile->qr_uuid}";
        $publicApiUrl = "{$apiBase}/api/v1/public/qr/{$profile->qr_uuid}";

        return [
            'qr_uuid' => $profile->qr_uuid,
            'public_profile_url' => $publicProfileUrl,
            'public_api_url' => $publicApiUrl,
            'payload' => [
                'type' => 'rescuelink-emergency-profile',
                'qr_uuid' => $profile->qr_uuid,
                'url' => $publicProfileUrl,
                'api_url' => $publicApiUrl,
            ],
        ];
    }
}

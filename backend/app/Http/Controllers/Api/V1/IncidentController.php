<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\NewIncidentSubmitted;
use App\Http\Controllers\Controller;
use App\Http\Requests\Incident\StoreOfflineIncidentMediaRequest;
use App\Http\Requests\Incident\StoreIncidentRequest;
use App\Http\Resources\Api\V1\IncidentDetailResource;
use App\Http\Resources\Api\V1\IncidentSummaryResource;
use App\Models\Incident;
use App\Services\GuestReportLimiter;
use App\Services\IncidentAiService;
use App\Support\ApiResponse;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class IncidentController extends Controller
{
    use ApiResponse;

    public function store(StoreIncidentRequest $request)
    {
        return $this->submitIncident($request, false);
    }

    public function guestQuota(Request $request, GuestReportLimiter $guestReports)
    {
        return $this->successResponse([
            'guest_quota' => $this->publicGuestQuota($guestReports->quota($request)),
        ], 'Guest reporting quota retrieved successfully.');
    }

    public function guestStore(StoreIncidentRequest $request, GuestReportLimiter $guestReports)
    {
        return $this->submitIncident($request, true, $guestReports);
    }

    public function storeOfflineMedia(StoreOfflineIncidentMediaRequest $request)
    {
        return $this->uploadOfflineMedia($request);
    }

    public function guestStoreOfflineMedia(StoreOfflineIncidentMediaRequest $request)
    {
        return $this->uploadOfflineMedia($request);
    }

    public function claimGuestReports(Request $request, GuestReportLimiter $guestReports)
    {
        $user = $request->user();
        $quota = $guestReports->quota($request);
        $guestIdentifier = (string) ($quota['guest_identifier'] ?? '');

        if ($guestIdentifier === '' || $user?->role !== 'citizen') {
            return $this->successResponse([
                'claimed_count' => 0,
            ], 'No guest reports were available to claim.');
        }

        $claimedCount = DB::transaction(function () use ($user, $guestIdentifier): int {
            $claimed = Incident::query()
                ->where('is_guest', true)
                ->where('guest_identifier', $guestIdentifier)
                ->update([
                    'reporter_id' => $user->id,
                    'is_guest' => false,
                    'guest_identifier' => null,
                    'updated_at' => now(),
                ]);

            DB::table('guest_report_usages')
                ->where('guest_identifier', $guestIdentifier)
                ->delete();

            return $claimed;
        });

        if ($claimedCount > 0) {
            Cache::forget('admin.triage_board.v3');
            Cache::forget('admin.command_center.snapshot.v4');
            Cache::forget('admin.incident_kpis.v3');
        }

        return $this->successResponse([
            'claimed_count' => $claimedCount,
        ], 'Guest reports linked to your account.');
    }

    private function submitIncident(
        StoreIncidentRequest $request,
        bool $isGuest,
        ?GuestReportLimiter $guestReports = null
    ) {
        $guestReports ??= $isGuest ? app(GuestReportLimiter::class) : null;
        $validated = $request->validated();
        $forceSubmit = $request->boolean('force_submit');
        $clientUuid = (string) ($validated['client_uuid'] ?? '');
        $offlineMedia = $this->validatedOfflineMedia($validated);
        $guestQuota = null;

        if ($clientUuid !== '') {
            $existingIncident = Incident::query()
                ->where('client_uuid', $clientUuid)
                ->first();

            if ($existingIncident) {
                $sameReporter = $isGuest
                    ? (bool) $existingIncident->is_guest
                    : $existingIncident->reporter_id === $request->user()?->id;

                if (! $sameReporter) {
                    return $this->errorResponse(
                        'Client report id was already used.',
                        ['client_uuid' => ['This client report id is already attached to another report.']],
                        409
                    );
                }

                $existingIncident->load([
                    'reporter:id,full_name,email,phone,barangay,address,role,status',
                    'media',
                    'logs.changedByUser:id,full_name,role',
                ]);

                return $this->successResponse([
                    'incident' => (new IncidentDetailResource($existingIncident))->resolve(),
                    'guest_quota' => null,
                ], 'Incident was already submitted from this device.', 200);
            }
        }

        if ($isGuest) {
            $guestQuota = $guestReports?->quota($request);

            if (($guestQuota['limit_reached'] ?? false) === true) {
                return $this->guestLimitReachedResponse($guestQuota);
            }
        }

        if (! $forceSubmit) {
            $duplicate = $this->findDuplicateIncident(
                (string) $validated['type'],
                (float) $validated['latitude'],
                (float) $validated['longitude']
            );

            if ($duplicate) {
                $minutesAgo = max(1, now()->diffInMinutes($duplicate->incident_datetime));

                return response()->json([
                    'success' => false,
                    'duplicate' => true,
                    'message' => "A similar report was already submitted nearby ({$minutesAgo} mins ago).",
                    'data' => [
                        'existing_incident_id' => $duplicate->id,
                        'minutes_ago' => $minutesAgo,
                        'guest_quota' => $guestQuota ? $this->publicGuestQuota($guestQuota) : null,
                    ],
                    'errors' => (object) [],
                ], 409);
            }
        }

        $result = DB::transaction(function () use ($request, $validated, $clientUuid, $isGuest, $guestReports, $offlineMedia, &$guestQuota) {
            if ($isGuest) {
                $guestQuota = $guestReports?->consume($request);

                if (! ($guestQuota['allowed'] ?? false)) {
                    throw new HttpResponseException($this->guestLimitReachedResponse($guestQuota ?? []));
                }
            }

            $incidentPayload = [
                'client_uuid' => $clientUuid !== '' ? $clientUuid : null,
                'reporter_id' => $isGuest ? null : $request->user()->id,
                'is_guest' => $isGuest,
                'guest_identifier' => $isGuest ? ($guestQuota['guest_identifier'] ?? null) : null,
                'type' => $validated['type'],
                'description' => $validated['description'],
                'incident_datetime' => Carbon::parse($validated['incident_datetime']),
                'latitude' => $validated['latitude'],
                'longitude' => $validated['longitude'],
                'address_label' => $validated['address_label'],
                'status' => 'pending_verification',
                'is_iot_generated' => false,
            ];

            $incident = $clientUuid !== ''
                ? Incident::query()->firstOrCreate(['client_uuid' => $clientUuid], $incidentPayload)
                : Incident::query()->create($incidentPayload);

            if (! $incident->wasRecentlyCreated) {
                $sameReporter = $isGuest
                    ? (bool) $incident->is_guest
                    : $incident->reporter_id === $request->user()?->id;

                if (! $sameReporter) {
                    throw new HttpResponseException($this->errorResponse(
                        'Client report id was already used.',
                        ['client_uuid' => ['This client report id is already attached to another report.']],
                        409
                    ));
                }

                return [
                    'incident' => $incident,
                    'created' => false,
                ];
            }

            $mediaDisk = config('filesystems.incident_media_disk', 'public');

            foreach ($request->file('media', []) as $mediaFile) {
                $storedPath = Storage::disk($mediaDisk)->putFile("incidents/{$incident->id}", $mediaFile);
                $mimeType = (string) $mediaFile->getMimeType();
                $fileType = str_starts_with($mimeType, 'video/') ? 'video' : 'image';

                $incident->media()->create([
                    'file_path' => $storedPath,
                    'file_type' => $fileType,
                ]);
            }

            foreach ($offlineMedia as $mediaItem) {
                $incident->media()->create([
                    'file_path' => $mediaItem['file_path'],
                    'file_type' => $mediaItem['file_type'],
                ]);
            }

            $incident->logs()->create([
                'changed_by' => $isGuest ? null : $request->user()->id,
                'old_status' => null,
                'new_status' => 'pending_verification',
                'notes' => $isGuest ? 'Incident submitted by guest reporter.' : 'Incident submitted by citizen.',
            ]);

            return [
                'incident' => $incident,
                'created' => true,
            ];
        });

        /** @var Incident $incident */
        $incident = $result['incident'];
        $created = (bool) ($result['created'] ?? true);

        $incident->load([
            'reporter:id,full_name,email,phone,barangay,address,role,status',
            'reporter.emergencyProfile:id,user_id,emergency_contact_name,emergency_contact_phone,is_public',
            'media',
            'logs.changedByUser:id,full_name,role',
        ]);

        if ($created) {
            $incident = app(IncidentAiService::class)->evaluate($incident);
            event(new NewIncidentSubmitted($incident));

            Cache::forget('admin.triage_board.v3');
            Cache::forget('admin.command_center.snapshot.v4');
            Cache::forget('admin.incident_kpis.v3');
        }

        return $this->successResponse([
            'incident' => (new IncidentDetailResource($incident))->resolve(),
            'guest_quota' => $guestQuota ? $this->publicGuestQuota($guestQuota) : null,
        ], $created ? 'Incident submitted successfully.' : 'Incident was already submitted from this device.', $created ? 201 : 200);
    }

    private function uploadOfflineMedia(StoreOfflineIncidentMediaRequest $request)
    {
        $validated = $request->validated();
        $clientUuid = (string) $validated['client_uuid'];
        $mediaDisk = config('filesystems.incident_media_disk', 'public');
        $media = [];

        foreach ($request->file('media', []) as $mediaFile) {
            $storedPath = Storage::disk($mediaDisk)->putFile("incidents/offline/{$clientUuid}", $mediaFile);
            $mimeType = (string) $mediaFile->getMimeType();
            $fileType = str_starts_with($mimeType, 'video/') ? 'video' : 'image';

            $media[] = [
                'file_path' => $storedPath,
                'file_type' => $fileType,
                'token' => $this->offlineMediaToken($clientUuid, $storedPath, $fileType),
            ];
        }

        return $this->successResponse([
            'media' => $media,
        ], 'Offline report media uploaded successfully.', 201);
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<int, array{file_path: string, file_type: string}>
     */
    private function validatedOfflineMedia(array $validated): array
    {
        $media = $validated['offline_media'] ?? [];

        if (! is_array($media) || $media === []) {
            return [];
        }

        $clientUuid = (string) ($validated['client_uuid'] ?? '');

        if ($clientUuid === '') {
            throw new HttpResponseException($this->errorResponse(
                'Client report id is required for offline media.',
                ['client_uuid' => ['Client report id is required for offline media.']],
            ));
        }

        return collect($media)
            ->map(function (array $item) use ($clientUuid): array {
                $filePath = (string) ($item['file_path'] ?? '');
                $fileType = (string) ($item['file_type'] ?? '');
                $token = (string) ($item['token'] ?? '');
                $expectedPrefix = "incidents/offline/{$clientUuid}/";
                $expectedToken = $this->offlineMediaToken($clientUuid, $filePath, $fileType);

                if (! str_starts_with($filePath, $expectedPrefix) || ! hash_equals($expectedToken, $token)) {
                    throw new HttpResponseException($this->errorResponse(
                        'Offline media token is invalid.',
                        ['offline_media' => ['Offline media could not be verified.']],
                    ));
                }

                return [
                    'file_path' => $filePath,
                    'file_type' => $fileType,
                ];
            })
            ->values()
            ->all();
    }

    private function offlineMediaToken(string $clientUuid, string $filePath, string $fileType): string
    {
        return hash_hmac('sha256', "{$clientUuid}|{$filePath}|{$fileType}", config('app.key'));
    }

    public function mine(Request $request)
    {
        $incidents = Incident::query()
            ->with([
                'latestAssignment.staff:id,full_name,barangay,role,status',
                'feedbackRatings' => function ($query) use ($request): void {
                    $query
                        ->where('user_id', $request->user()->id)
                        ->latest('created_at');
                },
            ])
            ->where('reporter_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->select([
                'id',
                'reference_code',
                'reporter_id',
                'is_guest',
                'type',
                'description',
                'latitude',
                'longitude',
                'address_label',
                'status',
                'is_iot_generated',
                'incident_datetime',
                'created_at',
                'resolved_at',
            ])
            ->paginate(10);
        $incidents->getCollection()->transform(
            fn (Incident $incident) => (new IncidentSummaryResource($incident))->resolve()
        );

        return $this->successResponse([
            'incidents' => $incidents,
        ], 'Your incidents retrieved successfully.');
    }

    public function show(Request $request, Incident $incident)
    {
        $user = $request->user();

        $incident->load([
            'reporter:id,full_name,email,phone,barangay,address,role,status',
            'media',
            'logs.changedByUser:id,full_name,role',
            'feedbackRatings' => function ($query) use ($user): void {
                $query
                    ->where('user_id', $user?->id)
                    ->latest('created_at');
            },
        ]);

        if ($user->role === 'citizen' && $incident->reporter_id !== $user->id) {
            return $this->errorResponse('You are not allowed to view this incident.', [], 403);
        }

        return $this->successResponse([
            'incident' => (new IncidentDetailResource($incident))->resolve(),
        ], 'Incident detail retrieved successfully.');
    }

    private function guestLimitReachedResponse(array $quota)
    {
        return response()->json([
            'success' => false,
            'code' => 'guest_report_limit_reached',
            'message' => "You've reached the maximum number of reports. Create an account to continue reporting and track your incidents.",
            'data' => [
                'guest_quota' => $this->publicGuestQuota($quota),
            ],
            'errors' => (object) [
                'guest' => ['Guest reporting limit reached.'],
            ],
        ], 429);
    }

    /**
     * @param  array<string, mixed>  $quota
     * @return array<string, mixed>
     */
    private function publicGuestQuota(array $quota): array
    {
        return [
            'limit' => (int) ($quota['limit'] ?? 10),
            'used' => (int) ($quota['used'] ?? 0),
            'remaining' => (int) ($quota['remaining'] ?? 0),
            'limit_reached' => (bool) ($quota['limit_reached'] ?? false),
        ];
    }

    private function findDuplicateIncident(string $type, float $latitude, float $longitude): ?Incident
    {
        $windowStart = now()->subMinutes(30);
        $now = now();

        $candidates = Incident::query()
            ->where('type', $type)
            ->whereBetween('incident_datetime', [$windowStart, $now])
            ->orderByDesc('incident_datetime')
            ->get([
                'id',
                'latitude',
                'longitude',
                'incident_datetime',
            ]);

        foreach ($candidates as $candidate) {
            $distanceMeters = $this->calculateDistanceInMeters(
                $latitude,
                $longitude,
                (float) $candidate->latitude,
                (float) $candidate->longitude
            );

            if ($distanceMeters <= 100) {
                return $candidate;
            }
        }

        return null;
    }

    private function calculateDistanceInMeters(
        float $lat1,
        float $lng1,
        float $lat2,
        float $lng2
    ): float {
        $earthRadius = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);

        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2))
            * sin($dLng / 2) ** 2;

        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $earthRadius * $c;
    }
}

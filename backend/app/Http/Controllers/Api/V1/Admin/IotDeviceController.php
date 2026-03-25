<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreIotDeviceRequest;
use App\Http\Requests\Admin\UpdateIotDeviceRequest;
use App\Models\Incident;
use App\Models\IotDevice;
use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class IotDeviceController extends Controller
{
    use ApiResponse;

    public function index()
    {
        $historyStart = now()->subDays(6)->startOfDay();
        $devices = IotDevice::query()
            ->orderBy('device_id')
            ->get([
                'id',
                'device_id',
                'location_name',
                'latitude',
                'longitude',
                'smoke_threshold',
                'is_active',
                'last_ping_at',
                'created_at',
            ]);

        $deviceCodes = $devices->pluck('device_id')->filter()->values();
        $alertEvents = $deviceCodes->isEmpty()
            ? collect()
            : Incident::query()
                ->where('is_iot_generated', true)
                ->whereIn('device_id', $deviceCodes)
                ->where('created_at', '>=', $historyStart)
                ->orderByDesc('created_at')
                ->get([
                    'id',
                    'reference_code',
                    'type',
                    'status',
                    'latitude',
                    'longitude',
                    'address_label',
                    'device_id',
                    'is_iot_generated',
                    'created_at',
                ]);

        $openAlertIncidents = $deviceCodes->isEmpty()
            ? collect()
            : Incident::query()
                ->where('is_iot_generated', true)
                ->whereIn('device_id', $deviceCodes)
                ->whereNotIn('status', ['resolved', 'rejected'])
                ->orderByDesc('created_at')
                ->get([
                    'id',
                    'reference_code',
                    'type',
                    'status',
                    'latitude',
                    'longitude',
                    'address_label',
                    'device_id',
                    'is_iot_generated',
                    'created_at',
                ]);

        $activeIncidents = Incident::query()
            ->whereNotIn('status', ['resolved', 'rejected'])
            ->orderByDesc('created_at')
            ->get([
                'id',
                'reference_code',
                'type',
                'status',
                'latitude',
                'longitude',
                'address_label',
                'device_id',
                'is_iot_generated',
                'created_at',
            ]);

        $alertsByDevice = $alertEvents->groupBy('device_id');
        $openAlertsByDevice = $openAlertIncidents->groupBy('device_id');

        return $this->successResponse([
            'devices' => $devices->map(function (IotDevice $device) use ($alertsByDevice, $openAlertsByDevice) {
                $recentAlerts = collect($alertsByDevice->get($device->device_id, []))
                    ->map(fn (Incident $incident) => $this->formatIncidentSummary($incident))
                    ->values();
                $openAlertIncident = collect($openAlertsByDevice->get($device->device_id, []))->first();

                return [
                    'id' => $device->id,
                    'device_id' => $device->device_id,
                    'location_name' => $device->location_name,
                    'latitude' => $device->latitude,
                    'longitude' => $device->longitude,
                    'smoke_threshold' => $device->smoke_threshold,
                    'is_active' => $device->is_active,
                    'last_ping_at' => $device->last_ping_at?->toIso8601String(),
                    'created_at' => $device->created_at?->toIso8601String(),
                    'battery_level' => null,
                    'status' => $this->resolveDeviceStatus($device, $openAlertIncident),
                    'recent_alert_count' => $recentAlerts->count(),
                    'alert_events' => $recentAlerts,
                    'open_alert_incident' => $openAlertIncident
                        ? $this->formatIncidentSummary($openAlertIncident)
                        : null,
                ];
            })->values(),
            'active_incidents' => $activeIncidents
                ->map(fn (Incident $incident) => $this->formatIncidentSummary($incident))
                ->values(),
            'history_window_days' => 7,
        ], 'IoT devices retrieved successfully.');
    }

    public function store(StoreIotDeviceRequest $request)
    {
        $validated = $request->validated();
        $rawApiKey = Str::random(64);

        $device = IotDevice::query()->create([
            'device_id' => $validated['device_id'],
            'location_name' => $validated['location_name'],
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'smoke_threshold' => $validated['smoke_threshold'] ?? 300,
            'api_key' => Hash::make($rawApiKey),
            'is_active' => true,
        ]);

        AuditLogger::record(
            $request->user(),
            'iot_device.create',
            $device,
            [],
            $this->deviceAuditSnapshot($device),
            metadata: [
                'api_key_generated' => true,
            ],
        );

        return $this->successResponse([
            'device' => [
                'id' => $device->id,
                'device_id' => $device->device_id,
                'location_name' => $device->location_name,
                'latitude' => $device->latitude,
                'longitude' => $device->longitude,
                'smoke_threshold' => $device->smoke_threshold,
                'is_active' => $device->is_active,
                'last_ping_at' => $device->last_ping_at,
                'created_at' => $device->created_at,
            ],
            'api_key' => $rawApiKey,
        ], 'IoT device created successfully.', 201);
    }

    public function update(UpdateIotDeviceRequest $request, IotDevice $iotDevice)
    {
        $before = $this->deviceAuditSnapshot($iotDevice);
        $iotDevice->update($request->validated());
        $iotDevice->refresh();

        AuditLogger::record(
            $request->user(),
            'iot_device.update',
            $iotDevice,
            $before,
            $this->deviceAuditSnapshot($iotDevice),
        );

        return $this->successResponse([
            'device' => $iotDevice->only([
                'id',
                'device_id',
                'location_name',
                'latitude',
                'longitude',
                'smoke_threshold',
                'is_active',
                'last_ping_at',
                'created_at',
            ]),
        ], 'IoT device updated successfully.');
    }

    public function destroy(Request $request, IotDevice $iotDevice)
    {
        $before = $this->deviceAuditSnapshot($iotDevice);

        $iotDevice->delete();

        AuditLogger::record(
            $request->user(),
            'iot_device.delete',
            [
                'entity_type' => 'IotDevice',
                'entity_id' => $iotDevice->id,
            ],
            $before,
            [],
        );

        return $this->successResponse([], 'IoT device deleted successfully.');
    }

    private function deviceAuditSnapshot(IotDevice $device): array
    {
        return [
            'device_id' => $device->device_id,
            'location_name' => $device->location_name,
            'latitude' => $device->latitude,
            'longitude' => $device->longitude,
            'smoke_threshold' => $device->smoke_threshold,
            'is_active' => $device->is_active,
            'last_ping_at' => $device->last_ping_at?->toIso8601String(),
        ];
    }

    private function resolveDeviceStatus(IotDevice $device, ?Incident $openAlertIncident): string
    {
        if ($openAlertIncident) {
            return 'alert';
        }

        if (! $device->is_active) {
            return 'inactive';
        }

        if ($device->last_ping_at && $device->last_ping_at->gte(now()->subMinutes(15))) {
            return 'online';
        }

        return 'offline';
    }

    /**
     * @return array{
     *     id: string,
     *     reference_code: ?string,
     *     type: string,
     *     status: string,
     *     latitude: float,
     *     longitude: float,
     *     address_label: string,
     *     device_id: ?string,
     *     is_iot_generated: bool,
     *     created_at: ?string
     * }
     */
    private function formatIncidentSummary(Incident $incident): array
    {
        return [
            'id' => $incident->id,
            'reference_code' => $incident->reference_code,
            'type' => $incident->type,
            'status' => $incident->status,
            'latitude' => (float) $incident->latitude,
            'longitude' => (float) $incident->longitude,
            'address_label' => $incident->address_label,
            'device_id' => $incident->device_id,
            'is_iot_generated' => (bool) $incident->is_iot_generated,
            'created_at' => $incident->created_at?->toIso8601String(),
        ];
    }
}

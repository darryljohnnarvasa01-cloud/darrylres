<?php

namespace App\Http\Middleware;

use App\Models\IotDevice;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Response;

class IotDeviceAuth
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $rawKey = $request->bearerToken();

        if (! $rawKey) {
            return response()->json([
                'success' => false,
                'errors' => ['authorization' => ['Missing IoT API key.']],
                'message' => 'Unauthorized IoT device.',
            ], 401);
        }

        $matchedDevice = null;
        $devices = IotDevice::query()
            ->where('is_active', true)
            ->get(['id', 'device_id', 'api_key', 'is_active']);

        foreach ($devices as $device) {
            if (Hash::check($rawKey, $device->api_key)) {
                $matchedDevice = $device;
                break;
            }
        }

        if (! $matchedDevice) {
            return response()->json([
                'success' => false,
                'errors' => ['authorization' => ['Invalid IoT API key.']],
                'message' => 'Unauthorized IoT device.',
            ], 401);
        }

        $matchedDevice->forceFill([
            'last_ping_at' => now(),
        ])->save();

        $request->attributes->set('authenticated_iot_device_id', $matchedDevice->id);
        $request->attributes->set('authenticated_iot_device_code', $matchedDevice->device_id);

        return $next($request);
    }
}

<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Incident;
use App\Models\IotDevice;
use App\Models\User;
use App\Support\ApiResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

class SystemController extends Controller
{
    use ApiResponse;

    public function health()
    {
        $database = $this->databaseStatus();
        $queue = $this->queueStatus($database['ok']);
        $cache = $this->cacheStatus();
        $broadcast = $this->broadcastStatus();
        $storage = $this->storageStatus();

        $services = [
            'database' => $database,
            'queue' => $queue,
            'cache' => $cache,
            'broadcast' => $broadcast,
            'storage' => $storage,
        ];

        $overallHealthy = collect($services)
            ->every(fn (array $service): bool => ($service['ok'] ?? false) === true);

        return $this->successResponse([
            'app_name' => config('app.name'),
            'environment' => config('app.env'),
            'timestamp' => now()->toIso8601String(),
            'status' => $overallHealthy ? 'healthy' : 'degraded',
            'services' => $services,
            'totals' => $this->totals($database['ok']),
        ], 'System health retrieved successfully.');
    }

    /**
     * @return array{ok: bool, driver: string, error: ?string}
     */
    private function databaseStatus(): array
    {
        try {
            DB::connection()->getPdo();

            return [
                'ok' => true,
                'driver' => (string) config('database.default'),
                'error' => null,
            ];
        } catch (Throwable $exception) {
            return [
                'ok' => false,
                'driver' => (string) config('database.default'),
                'error' => $exception->getMessage(),
            ];
        }
    }

    /**
     * @return array{ok: bool, connection: string, pending_jobs: ?int, failed_jobs: ?int, error: ?string}
     */
    private function queueStatus(bool $databaseConnected): array
    {
        if (! $databaseConnected) {
            return [
                'ok' => false,
                'connection' => (string) config('queue.default'),
                'pending_jobs' => null,
                'failed_jobs' => null,
                'error' => 'Database unavailable.',
            ];
        }

        try {
            $pendingJobs = Schema::hasTable('jobs')
                ? DB::table('jobs')->count()
                : 0;

            $failedJobs = Schema::hasTable('failed_jobs')
                ? DB::table('failed_jobs')->count()
                : 0;

            return [
                'ok' => $failedJobs === 0,
                'connection' => (string) config('queue.default'),
                'pending_jobs' => $pendingJobs,
                'failed_jobs' => $failedJobs,
                'error' => null,
            ];
        } catch (Throwable $exception) {
            return [
                'ok' => false,
                'connection' => (string) config('queue.default'),
                'pending_jobs' => null,
                'failed_jobs' => null,
                'error' => $exception->getMessage(),
            ];
        }
    }

    /**
     * @return array{ok: bool, store: string}
     */
    private function cacheStatus(): array
    {
        $store = (string) config('cache.default');

        return [
            'ok' => $store !== '',
            'store' => $store,
        ];
    }

    /**
     * @return array{ok: bool, connection: string}
     */
    private function broadcastStatus(): array
    {
        $connection = (string) config('broadcasting.default');

        return [
            'ok' => $connection !== '',
            'connection' => $connection,
        ];
    }

    /**
     * @return array{ok: bool, disk: string, path: string, error: ?string}
     */
    private function storageStatus(): array
    {
        $path = storage_path('app');
        $ok = is_dir($path) && is_writable($path);

        return [
            'ok' => $ok,
            'disk' => (string) config('filesystems.default'),
            'path' => $path,
            'error' => $ok ? null : 'Storage path is not writable.',
        ];
    }

    /**
     * @return array{
     *     users: ?int,
     *     incidents: ?int,
     *     open_incidents: ?int,
     *     active_iot_devices: ?int,
     *     online_iot_devices: ?int,
     *     error: ?string
     * }
     */
    private function totals(bool $databaseConnected): array
    {
        if (! $databaseConnected) {
            return [
                'users' => null,
                'incidents' => null,
                'open_incidents' => null,
                'active_iot_devices' => null,
                'online_iot_devices' => null,
                'error' => 'Database unavailable.',
            ];
        }

        try {
            $onlineCutoff = now()->subMinutes(15);

            return [
                'users' => User::query()->count(),
                'incidents' => Incident::query()->count(),
                'open_incidents' => Incident::query()->whereNotIn('status', ['resolved', 'rejected'])->count(),
                'active_iot_devices' => IotDevice::query()->where('is_active', true)->count(),
                'online_iot_devices' => IotDevice::query()
                    ->where('is_active', true)
                    ->where('last_ping_at', '>=', $onlineCutoff)
                    ->count(),
                'error' => null,
            ];
        } catch (Throwable $exception) {
            return [
                'users' => null,
                'incidents' => null,
                'open_incidents' => null,
                'active_iot_devices' => null,
                'online_iot_devices' => null,
                'error' => $exception->getMessage(),
            ];
        }
    }
}

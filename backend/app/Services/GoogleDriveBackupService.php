<?php

namespace App\Services;

use Google\Client;
use Google\Service\Drive;
use Google\Service\Drive\DriveFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class GoogleDriveBackupService
{
    /**
     * @return array<string, mixed>
     */
    public function configurationStatus(): array
    {
        return [
            'configured' => $this->hasClientConfig() && filled(config('services.google_drive.backup_folder_id')),
            'has_client_config' => $this->hasClientConfig(),
            'has_redirect_uri' => filled(config('services.google_drive.redirect_uri')),
            'has_backup_folder_id' => filled(config('services.google_drive.backup_folder_id')),
        ];
    }

    public function authUrl(): string
    {
        $client = $this->client();
        $client->setAccessType('offline');
        $client->setPrompt('consent');
        $client->setIncludeGrantedScopes(true);

        return $client->createAuthUrl();
    }

    /**
     * @return array<string, mixed>
     */
    public function backup(): array
    {
        $folderId = (string) config('services.google_drive.backup_folder_id');

        if ($folderId === '') {
            throw new RuntimeException('GOOGLE_DRIVE_BACKUP_FOLDER_ID is not configured.');
        }

        $clientConfig = $this->decodedClientConfig();
        $refreshToken = $this->refreshTokenFromConfig($clientConfig);

        if ($refreshToken === null) {
            throw new RuntimeException('Google Drive refresh token is missing from GOOGLE_DRIVE_CLIENT_CONFIG.');
        }

        $client = $this->client($clientConfig);
        $client->fetchAccessTokenWithRefreshToken($refreshToken);

        if ($client->isAccessTokenExpired() && $client->getRefreshToken()) {
            $client->fetchAccessTokenWithRefreshToken($client->getRefreshToken());
        }

        $path = $this->createBackupFile();
        $drive = new Drive($client);
        $driveFile = new DriveFile([
            'name' => basename($path),
            'parents' => [$folderId],
            'mimeType' => 'application/json',
        ]);

        $uploaded = $drive->files->create($driveFile, [
            'data' => File::get($path),
            'mimeType' => 'application/json',
            'uploadType' => 'multipart',
            'fields' => 'id,name,webViewLink,createdTime',
        ]);

        return [
            'local_file' => $path,
            'drive_file' => [
                'id' => $uploaded->id,
                'name' => $uploaded->name,
                'web_view_link' => $uploaded->webViewLink,
                'created_time' => $uploaded->createdTime,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>|null  $clientConfig
     */
    private function client(?array $clientConfig = null): Client
    {
        $client = new Client();
        $client->setApplicationName((string) config('app.name', 'RescueLink'));
        $client->setScopes([Drive::DRIVE_FILE]);

        $config = $clientConfig ?? $this->decodedClientConfig();

        if ($config !== []) {
            $client->setAuthConfig($config);
        } else {
            $clientId = (string) config('services.google.client_id');
            $clientSecret = (string) config('services.google.client_secret');

            if ($clientId === '' || $clientSecret === '') {
                throw new RuntimeException('Google OAuth client configuration is missing.');
            }

            $client->setClientId($clientId);
            $client->setClientSecret($clientSecret);
        }

        $redirectUri = (string) config('services.google_drive.redirect_uri');

        if ($redirectUri !== '') {
            $client->setRedirectUri($redirectUri);
        }

        return $client;
    }

    private function hasClientConfig(): bool
    {
        return filled(config('services.google_drive.client_config'))
            || (filled(config('services.google.client_id')) && filled(config('services.google.client_secret')));
    }

    /**
     * @return array<string, mixed>
     */
    private function decodedClientConfig(): array
    {
        $raw = trim((string) config('services.google_drive.client_config'));

        if ($raw === '') {
            return [];
        }

        $decoded = json_decode($raw, true);

        if (is_array($decoded)) {
            return $decoded;
        }

        $base64Decoded = base64_decode($raw, true);

        if ($base64Decoded !== false) {
            $decoded = json_decode($base64Decoded, true);

            if (is_array($decoded)) {
                return $decoded;
            }
        }

        throw new RuntimeException('GOOGLE_DRIVE_CLIENT_CONFIG must be a JSON object or base64-encoded JSON object.');
    }

    /**
     * @param  array<string, mixed>  $config
     */
    private function refreshTokenFromConfig(array $config): ?string
    {
        foreach ([
            $config['refresh_token'] ?? null,
            $config['token']['refresh_token'] ?? null,
            $config['web']['refresh_token'] ?? null,
            $config['installed']['refresh_token'] ?? null,
        ] as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    private function createBackupFile(): string
    {
        $backupDir = storage_path('app/backups');
        File::ensureDirectoryExists($backupDir);

        $payload = [
            'generated_at' => now()->toIso8601String(),
            'database' => config('database.default'),
            'tables' => $this->tablePayload(),
        ];
        $path = $backupDir.'/rescuelink-backup-'.now()->format('Ymd-His').'.json';

        File::put($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

        return $path;
    }

    /**
     * @return array<string, mixed>
     */
    private function tablePayload(): array
    {
        $tables = [
            'users',
            'incidents',
            'incident_assignments',
            'incident_logs',
            'responder_locations',
            'responder_status_logs',
            'iot_devices',
        ];

        return collect($tables)
            ->filter(fn (string $table): bool => Schema::hasTable($table))
            ->mapWithKeys(fn (string $table): array => [
                $table => DB::table($table)->orderBy('created_at')->get()->map(fn ($row) => (array) $row)->all(),
            ])
            ->all();
    }
}

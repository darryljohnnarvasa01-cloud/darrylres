<?php

use App\Services\GoogleDriveBackupService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

Artisan::command('rescuelink:backup-google-drive', function (GoogleDriveBackupService $backupService) {
    $result = $backupService->backup();
    $driveFile = $result['drive_file'] ?? [];

    $this->info('Google Drive backup completed.');
    $this->line('Local file: '.($result['local_file'] ?? '-'));
    $this->line('Drive file: '.($driveFile['name'] ?? '-').' ('.($driveFile['id'] ?? '-').')');
})->purpose('Back up RescueLink database tables to the configured Google Drive folder.');

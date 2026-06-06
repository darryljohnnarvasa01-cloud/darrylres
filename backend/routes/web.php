<?php

use App\Http\Controllers\GoogleDriveOAuthController;
use Illuminate\Support\Facades\Route;

Route::get('/oauth/google-drive/callback', [GoogleDriveOAuthController::class, 'callback'])
    ->name('google-drive.callback');

Route::get('/{path?}', function () {
    return redirect()->away((string) config('app.frontend_url', env('FRONTEND_URL', 'http://127.0.0.1:5173')));
})->where('path', '^(?!api|storage|broadcasting).*$');

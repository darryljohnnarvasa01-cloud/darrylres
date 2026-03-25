<?php

use App\Http\Controllers\Api\V1\Admin\AdminAuditLogController;
use App\Http\Controllers\Api\V1\Admin\AdminBroadcastController;
use App\Http\Controllers\Api\V1\Admin\AdminCommandCenterController;
use App\Http\Controllers\Api\V1\Admin\AdminIncidentController;
use App\Http\Controllers\Api\V1\Admin\AdminRegistrationController;
use App\Http\Controllers\Api\V1\Admin\AdminStaffController;
use App\Http\Controllers\Api\V1\Admin\AdminStaffPerformanceController;
use App\Http\Controllers\Api\V1\Admin\AnalyticsController;
use App\Http\Controllers\Api\V1\Admin\IotDeviceController;
use App\Http\Controllers\Api\V1\Admin\SystemController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\IncidentController;
use App\Http\Controllers\Api\V1\IotController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\PublicIncidentController;
use App\Http\Controllers\Api\V1\Staff\StaffIncidentController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::prefix('auth')->group(function () {
        Route::post('/register', [AuthController::class, 'register']);
        Route::post('/login', [AuthController::class, 'login']);
        Route::get('/me', [AuthController::class, 'me'])->middleware('auth:sanctum');
        Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
    });

    Route::middleware(['auth:sanctum', 'role:admin'])->prefix('admin')->group(function () {
        Route::middleware('ability:manage-incidents')->group(function () {
            Route::get('/dashboard/command-center', [AdminCommandCenterController::class, 'show']);
            Route::get('/incidents', [AdminIncidentController::class, 'index']);
            Route::get('/incidents/map', [AdminIncidentController::class, 'map']);
            Route::get('/incidents/triage-board', [AdminIncidentController::class, 'triageBoard']);
            Route::get('/incidents/{incident}', [AdminIncidentController::class, 'show']);
            Route::patch('/incidents/{incident}/verify', [AdminIncidentController::class, 'verify']);
            Route::patch('/incidents/{incident}/reject', [AdminIncidentController::class, 'reject']);
            Route::patch('/incidents/{incidentId}/status', [AdminIncidentController::class, 'updateStatus']);
            Route::get('/staff', [AdminIncidentController::class, 'staff']);
            Route::get('/kpis', [AdminIncidentController::class, 'kpis']);
        });

        Route::middleware('ability:manage-users')->group(function () {
            Route::get('/registrations', [AdminRegistrationController::class, 'index']);
            Route::patch('/registrations/{user}/approve', [AdminRegistrationController::class, 'approve']);
            Route::patch('/registrations/{user}/reject', [AdminRegistrationController::class, 'reject']);
            Route::post('/staff', [AdminStaffController::class, 'store']);
            Route::get('/gov-id/{filename}', [AdminRegistrationController::class, 'showGovId'])
                ->name('admin.gov-id.show')
                ->middleware('signed:relative');
        });

        Route::middleware('ability:view-analytics')->group(function () {
            Route::get('/incidents/export', [AnalyticsController::class, 'exportIncidents']);
            Route::get('/analytics/monthly', [AnalyticsController::class, 'monthly']);
            Route::get('/analytics/overview', [AnalyticsController::class, 'overview']);
            Route::get('/analytics/by-type', [AnalyticsController::class, 'byType']);
            Route::get('/analytics/by-barangay', [AnalyticsController::class, 'byBarangay']);
            Route::get('/analytics/kpis', [AnalyticsController::class, 'kpis']);
        });

        Route::middleware('ability:manage-iot')->group(function () {
            Route::get('/iot-devices', [IotDeviceController::class, 'index']);
            Route::post('/iot-devices', [IotDeviceController::class, 'store']);
            Route::patch('/iot-devices/{iotDevice}', [IotDeviceController::class, 'update']);
            Route::delete('/iot-devices/{iotDevice}', [IotDeviceController::class, 'destroy']);
        });

        Route::middleware('ability:broadcast-messages')->group(function () {
            Route::get('/broadcast/recipients', [AdminBroadcastController::class, 'index']);
            Route::post('/broadcast', [AdminBroadcastController::class, 'store']);
        });

        Route::get('/staff/performance', [AdminStaffPerformanceController::class, 'index']);
        Route::get('/audit-logs', [AdminAuditLogController::class, 'index']);
        Route::get('/system/health', [SystemController::class, 'health']);
    });

    Route::middleware(['auth:sanctum'])->group(function () {
        Route::post('/incidents', [IncidentController::class, 'store'])->middleware('role:citizen');
        Route::get('/incidents/mine', [IncidentController::class, 'mine'])->middleware('role:citizen');
        Route::get('/incidents/{incident}', [IncidentController::class, 'show']);

        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::patch('/notifications/read-all', [NotificationController::class, 'markAllRead']);
        Route::patch('/notifications/{id}/read', [NotificationController::class, 'markRead']);
        Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    });

    Route::middleware(['auth:sanctum', 'role:staff'])->prefix('staff')->group(function () {
        Route::get('/incidents', [StaffIncidentController::class, 'index']);
        Route::get('/incidents/{incidentId}', [StaffIncidentController::class, 'show']);
        Route::patch('/incidents/{incidentId}/status', [StaffIncidentController::class, 'updateStatus']);
    });

    Route::post('/iot/alert', [IotController::class, 'alert'])->middleware('iot.device');

    Route::prefix('public')->group(function () {
        Route::get('/incidents/map', [PublicIncidentController::class, 'map']);
        Route::get('/incidents/recent', [PublicIncidentController::class, 'recent']);
        Route::get('/incidents/verify/{incidentCode}', [PublicIncidentController::class, 'verify']);
        Route::get('/stats', [PublicIncidentController::class, 'stats']);
    });
});

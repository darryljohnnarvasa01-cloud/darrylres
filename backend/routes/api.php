<?php

use App\Http\Controllers\Api\V1\Admin\AdminAuditLogController;
use App\Http\Controllers\Api\V1\Admin\AdminBroadcastController;
use App\Http\Controllers\Api\V1\Admin\AdminCommandCenterController;
use App\Http\Controllers\Api\V1\Admin\AdminIncidentController;
use App\Http\Controllers\Api\V1\Admin\AdminRegistrationController;
use App\Http\Controllers\Api\V1\Admin\AdminRoleController;
use App\Http\Controllers\Api\V1\Admin\AdminStaffController;
use App\Http\Controllers\Api\V1\Admin\AdminStaffPerformanceController;
use App\Http\Controllers\Api\V1\Admin\AiRiskBoardController;
use App\Http\Controllers\Api\V1\Admin\AnalyticsController;
use App\Http\Controllers\Api\V1\Admin\FeedbackController as AdminFeedbackController;
use App\Http\Controllers\Api\V1\Admin\HazardZoneController as AdminHazardZoneController;
use App\Http\Controllers\Api\V1\Admin\IotDeviceController;
use App\Http\Controllers\Api\V1\Admin\ResponderTrackingController as AdminResponderTrackingController;
use App\Http\Controllers\Api\V1\Admin\SystemController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BroadcastController;
use App\Http\Controllers\Api\V1\CrowdsourcedIncidentController;
use App\Http\Controllers\Api\V1\CitizenResponderTrackingController;
use App\Http\Controllers\Api\V1\EmergencyProfileController;
use App\Http\Controllers\Api\V1\FeedbackController;
use App\Http\Controllers\Api\V1\IncidentController;
use App\Http\Controllers\Api\V1\IotController;
use App\Http\Controllers\Api\V1\MessageController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\PublicConfigController;
use App\Http\Controllers\Api\V1\PublicEvacuationCenterController;
use App\Http\Controllers\Api\V1\PublicHazardZoneController;
use App\Http\Controllers\Api\V1\PublicIncidentController;
use App\Http\Controllers\Api\V1\SosController;
use App\Http\Controllers\Api\V1\Staff\FeedbackController as StaffFeedbackController;
use App\Http\Controllers\Api\V1\Staff\ResponderTrackingController as StaffResponderTrackingController;
use App\Http\Controllers\Api\V1\Staff\StaffIncidentController;
use App\Http\Controllers\Api\V1\VolunteerController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('/public/config', [PublicConfigController::class, 'show']);

    Route::prefix('auth')->group(function () {
        Route::post('/register', [AuthController::class, 'register']);
        Route::post('/login', [AuthController::class, 'login']);
        Route::get('/me', [AuthController::class, 'me'])->middleware('auth:sanctum');
        Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
    });

    Route::get('/incidents/guest/quota', [IncidentController::class, 'guestQuota']);
    Route::post('/incidents/guest/offline-media', [IncidentController::class, 'guestStoreOfflineMedia'])->middleware('throttle:guest-reports');
    Route::post('/incidents/guest', [IncidentController::class, 'guestStore'])->middleware('throttle:guest-reports');
    Route::post('/sos/guest', [SosController::class, 'guestStore'])->middleware('throttle:sos-alerts');

    Route::middleware(['auth:sanctum', 'role:admin'])->prefix('admin')->group(function () {
        Route::middleware('ability:view-dashboard')->group(function () {
            Route::get('/dashboard/command-center', [AdminCommandCenterController::class, 'show']);
            Route::get('/staff/performance', [AdminStaffPerformanceController::class, 'index']);
            Route::get('/responders/locations', [AdminResponderTrackingController::class, 'index']);
            Route::get('/responders/{responder}/health-logs', [AdminResponderTrackingController::class, 'healthLogs']);
            Route::get('/responders/{responder}/routes', [AdminResponderTrackingController::class, 'route']);
        });

        Route::middleware('ability:manage-incidents')->group(function () {
            Route::get('/ai-risk-board', [AiRiskBoardController::class, 'index']);
            Route::get('/incidents', [AdminIncidentController::class, 'index']);
            Route::get('/incidents/map', [AdminIncidentController::class, 'map']);
            Route::get('/incidents/triage-board', [AdminIncidentController::class, 'triageBoard']);
            Route::get('/incidents/{incident}', [AdminIncidentController::class, 'show']);
            Route::patch('/incidents/{incident}/verify', [AdminIncidentController::class, 'verify']);
            Route::patch('/incidents/{incident}/reject', [AdminIncidentController::class, 'reject']);
            Route::patch('/incidents/{incidentId}/status', [AdminIncidentController::class, 'updateStatus']);
            Route::get('/staff', [AdminIncidentController::class, 'staff']);
            Route::get('/kpis', [AdminIncidentController::class, 'kpis']);
            Route::get('/hazard-zones', [AdminHazardZoneController::class, 'index']);
            Route::post('/hazard-zones', [AdminHazardZoneController::class, 'store']);
            Route::patch('/hazard-zones/{hazardZone}', [AdminHazardZoneController::class, 'update']);
            Route::delete('/hazard-zones/{hazardZone}', [AdminHazardZoneController::class, 'destroy'])->middleware('ability:delete-records');
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

        Route::middleware('ability:manage-roles')->group(function () {
            Route::get('/roles', [AdminRoleController::class, 'index']);
            Route::post('/roles', [AdminRoleController::class, 'store']);
            Route::patch('/roles/{role}', [AdminRoleController::class, 'update']);
            Route::delete('/roles/{role}', [AdminRoleController::class, 'destroy']);
            Route::patch('/users/{user}/role', [AdminRoleController::class, 'assign']);
            Route::post('/admins', [AdminRoleController::class, 'createAdmin']);
        });

        Route::middleware('ability:view-reports')->group(function () {
            Route::get('/incidents/export', [AnalyticsController::class, 'exportIncidents']);
            Route::get('/feedback', [AdminFeedbackController::class, 'index']);
            Route::get('/audit-logs', [AdminAuditLogController::class, 'index']);
        });

        Route::middleware('ability:view-analytics')->group(function () {
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
            Route::delete('/iot-devices/{iotDevice}', [IotDeviceController::class, 'destroy'])->middleware('ability:delete-records');
        });

        Route::middleware('ability:broadcast-messages')->group(function () {
            Route::get('/broadcast/recipients', [AdminBroadcastController::class, 'index']);
            Route::post('/broadcast', [AdminBroadcastController::class, 'store']);
        });

        Route::get('/system/health', [SystemController::class, 'health'])->middleware('ability:edit-system-settings');
        Route::get('/system/google-drive/auth-url', [SystemController::class, 'googleDriveAuthUrl'])->middleware('ability:edit-system-settings');
        Route::post('/system/google-drive/backup', [SystemController::class, 'googleDriveBackup'])->middleware('ability:edit-system-settings');
    });

    Route::middleware(['auth:sanctum'])->group(function () {
        Route::post('/sos', [SosController::class, 'store']);
        Route::get('/volunteers/nearby', [VolunteerController::class, 'nearby']);
        Route::post('/volunteers/register', [VolunteerController::class, 'register'])->middleware('role:citizen');
        Route::post('/volunteers/incidents/{incident}/accept', [VolunteerController::class, 'acceptMission'])->middleware('role:citizen');

        Route::post('/incidents/offline-media', [IncidentController::class, 'storeOfflineMedia'])->middleware('role:citizen');
        Route::post('/incidents', [IncidentController::class, 'store'])->middleware('role:citizen');
        Route::post('/feedback', [FeedbackController::class, 'store'])->middleware('role:citizen');
        Route::post('/incidents/guest/claim', [IncidentController::class, 'claimGuestReports'])->middleware('role:citizen');
        Route::get('/incidents/mine', [IncidentController::class, 'mine'])->middleware('role:citizen');
        Route::get('/incidents/{incident}/responder-tracking', [CitizenResponderTrackingController::class, 'show'])->middleware('role:citizen');
        Route::get('/incidents/{incident}', [IncidentController::class, 'show']);

        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::patch('/notifications/read-all', [NotificationController::class, 'markAllRead']);
        Route::patch('/notifications/{id}/read', [NotificationController::class, 'markRead']);
        Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
        Route::prefix('messages')->group(function () {
            Route::get('/conversations', [MessageController::class, 'index']);
            Route::post('/conversations', [MessageController::class, 'storeConversation']);
            Route::get('/conversations/{conversation}', [MessageController::class, 'show']);
            Route::post('/conversations/{conversation}/messages', [MessageController::class, 'storeMessage']);
            Route::patch('/messages/{message}/read', [MessageController::class, 'markRead']);
            Route::patch('/{message}/read', [MessageController::class, 'markRead']);
        });
        Route::get('/broadcasts', [BroadcastController::class, 'index']);
        Route::get('/broadcasts/unread-count', [BroadcastController::class, 'unreadCount']);
        Route::patch('/broadcasts/{broadcastId}/read', [BroadcastController::class, 'markRead']);
        Route::get('/profile/qr', [EmergencyProfileController::class, 'showQr'])->middleware('role:citizen');
        Route::patch('/profile/emergency', [EmergencyProfileController::class, 'update'])->middleware('role:citizen');
    });

    Route::middleware(['auth:sanctum', 'role:staff'])->prefix('staff')->group(function () {
        Route::get('/tracking', [StaffResponderTrackingController::class, 'show']);
        Route::post('/tracking', [StaffResponderTrackingController::class, 'update']);
        Route::post('/tracking/route-point', [StaffResponderTrackingController::class, 'storeRoutePoint']);
        Route::post('/tracking/health-log', [StaffResponderTrackingController::class, 'storeHealthLog']);
        Route::get('/feedback', [StaffFeedbackController::class, 'index']);
        Route::get('/incidents', [StaffIncidentController::class, 'index']);
        Route::get('/incidents/{incidentId}', [StaffIncidentController::class, 'show']);
        Route::patch('/incidents/{incidentId}/status', [StaffIncidentController::class, 'updateStatus']);
    });

    Route::post('/iot/alert', [IotController::class, 'alert'])->middleware('iot.device');

    Route::prefix('public')->group(function () {
        Route::get('/incidents/map', [PublicIncidentController::class, 'map']);
        Route::get('/incidents/recent', [PublicIncidentController::class, 'recent']);
        Route::get('/incidents/verify/{incidentCode}', [PublicIncidentController::class, 'verify']);
        Route::get('/qr/{qrUuid}', [EmergencyProfileController::class, 'publicShow']);
        Route::get('/hazard-zones', [PublicHazardZoneController::class, 'index']);
        Route::get('/evacuation-centers', [PublicEvacuationCenterController::class, 'index']);
        Route::get('/stats', [PublicIncidentController::class, 'stats']);
    });

    Route::post('/incidents/{incident}/confirm', [CrowdsourcedIncidentController::class, 'confirm'])->middleware('throttle:crowdsource');
    Route::post('/incidents/{incident}/dispute', [CrowdsourcedIncidentController::class, 'dispute'])->middleware('throttle:crowdsource');
});

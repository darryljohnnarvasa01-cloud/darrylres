<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\NotificationCreated;
use App\Http\Controllers\Controller;
use App\Http\Requests\Sos\StoreSosRequest;
use App\Models\Notification;
use App\Models\SosAlert;
use App\Models\User;
use App\Support\ApiResponse;
use Illuminate\Support\Facades\DB;

class SosController extends Controller
{
    use ApiResponse;

    public function store(StoreSosRequest $request)
    {
        return $this->submitSos($request, false);
    }

    public function guestStore(StoreSosRequest $request)
    {
        return $this->submitSos($request, true);
    }

    private function submitSos(StoreSosRequest $request, bool $isGuest)
    {
        $validated = $request->validated();
        $user = $isGuest ? null : $request->user();

        $alert = DB::transaction(function () use ($validated, $user): SosAlert {
            return SosAlert::query()->create([
                'user_id' => $user?->id,
                'latitude' => $validated['latitude'],
                'longitude' => $validated['longitude'],
                'status' => 'pending',
                'created_at' => now(),
            ]);
        });

        $this->notifyEmergencyResponders($alert, (string) $validated['description'], $user);

        return $this->successResponse([
            'sos_alert' => [
                'id' => $alert->id,
                'user_id' => $alert->user_id,
                'latitude' => $alert->latitude,
                'longitude' => $alert->longitude,
                'status' => $alert->status,
                'created_at' => $alert->created_at?->toIso8601String(),
            ],
        ], 'SOS alert sent successfully.', 201);
    }

    private function notifyEmergencyResponders(SosAlert $alert, string $description, ?User $reporter): void
    {
        $responders = User::query()
            ->whereIn('role', ['admin', 'staff'])
            ->where('status', 'verified')
            ->get(['id', 'role', 'full_name']);

        if ($responders->isEmpty()) {
            return;
        }

        $reporterName = $reporter?->full_name ?? 'Guest reporter';
        $coordinates = "{$alert->latitude}, {$alert->longitude}";

        foreach ($responders as $responder) {
            $notification = Notification::query()->create([
                'user_id' => $responder->id,
                'title' => 'Emergency SOS alert',
                'message' => "{$description} by {$reporterName} near {$coordinates}.",
                'link' => $responder->role === 'admin' ? '/admin/dashboard' : '/staff',
                'is_read' => false,
                'created_at' => now(),
            ]);

            $channel = $responder->role === 'admin'
                ? 'admin.notifications'
                : "staff.{$responder->id}";

            event(NotificationCreated::fromNotification($notification, [$channel]));
        }
    }
}

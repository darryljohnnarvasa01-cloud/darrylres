<?php

namespace App\Listeners;

use App\Events\NotificationCreated;
use App\Mail\NotificationMail;
use App\Models\EmailNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Mail;

class SendNotificationEmail implements ShouldQueue
{
    use InteractsWithQueue;

    public int $tries = 3;

    public int $backoff = 5;

    public function handle(NotificationCreated $event): void
    {
        $payload = $event->payload;

        // Get the notification ID from payload
        $notificationId = $payload['id'] ?? null;
        if (!$notificationId) {
            return;
        }

        // Find the notification with user
        $notification = \App\Models\Notification::query()
            ->with('user')
            ->find($notificationId);

        if (!$notification || !$notification->user) {
            return;
        }

        $user = $notification->user;

        // Skip if user has no email
        if (empty($user->email)) {
            return;
        }

        // Create email log entry in Supabase
        $emailLog = EmailNotification::create([
            'user_id' => $user->id,
            'notification_id' => $notificationId,
            'email_to' => $user->email,
            'subject' => $notification->title,
            'content' => json_encode([
                'title' => $notification->title,
                'message' => $notification->message,
                'link' => $notification->link,
            ]),
            'status' => 'pending',
        ]);

        // Send the email
        try {
            Mail::to($user->email)->send(new NotificationMail($notification));

            // Mark as sent in Supabase
            $emailLog->markAsSent();
        } catch (\Exception $e) {
            // Log failure in Supabase
            $emailLog->markAsFailed($e->getMessage());

            \Illuminate\Support\Facades\Log::error('Failed to send notification email', [
                'notification_id' => $notificationId,
                'user_id' => $user->id,
                'email_log_id' => $emailLog->id,
                'error' => $e->getMessage(),
            ]);

            // Re-throw to trigger retry
            throw $e;
        }
    }
}

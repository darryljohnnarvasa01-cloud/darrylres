<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BroadcastController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $broadcasts = DB::table('broadcast_recipients')
            ->join('broadcasts', 'broadcasts.id', '=', 'broadcast_recipients.broadcast_id')
            ->leftJoin('users as senders', 'senders.id', '=', 'broadcasts.sent_by')
            ->where('broadcast_recipients.user_id', $request->user()->id)
            ->orderByDesc('broadcasts.created_at')
            ->limit(50)
            ->get([
                'broadcasts.id',
                'broadcasts.title',
                'broadcasts.message',
                'broadcasts.link',
                'broadcasts.target_type',
                'broadcasts.target_barangay',
                'broadcasts.created_at',
                'senders.full_name as sender_name',
                'broadcast_recipients.is_read',
            ]);

        return $this->successResponse([
            'broadcasts' => $broadcasts,
        ], 'Broadcasts retrieved successfully.');
    }

    public function markRead(Request $request, string $broadcastId)
    {
        $recipient = DB::table('broadcast_recipients')
            ->where('broadcast_id', $broadcastId)
            ->where('user_id', $request->user()->id)
            ->first();

        if (! $recipient) {
            return $this->errorResponse('Broadcast not found.', [], 404);
        }

        DB::table('broadcast_recipients')
            ->where('broadcast_id', $broadcastId)
            ->where('user_id', $request->user()->id)
            ->update(['is_read' => true]);

        return $this->successResponse([
            'broadcast_id' => $broadcastId,
            'is_read' => true,
        ], 'Broadcast marked as read.');
    }

    public function unreadCount(Request $request)
    {
        $count = DB::table('broadcast_recipients')
            ->where('user_id', $request->user()->id)
            ->where('is_read', false)
            ->count();

        return $this->successResponse([
            'count' => $count,
        ], 'Unread broadcast count retrieved successfully.');
    }
}

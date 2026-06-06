<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\NotificationCreated;
use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\EmergencyProfile;
use App\Models\Incident;
use App\Models\Message;
use App\Models\Notification;
use App\Models\User;
use App\Support\ApiResponse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class MessageController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'incident_id' => ['nullable', 'uuid', 'exists:incidents,id'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $validated = $validator->validated();
        $user = $request->user();

        $query = Conversation::query()
            ->whereHas('participants', fn (Builder $query) => $query->where('users.id', $user->id))
            ->when(! empty($validated['incident_id']), fn (Builder $query) => $query->where('incident_id', $validated['incident_id']))
            ->with($this->conversationRelations())
            ->withCount([
                'messages as unread_count' => fn (Builder $query) => $query
                    ->where('recipient_id', $user->id)
                    ->whereNull('read_at'),
            ])
            ->orderByDesc('updated_at');

        $conversations = $query->paginate($validated['per_page'] ?? 20)->withQueryString();
        $this->loadLatestMessages($conversations->getCollection());
        $conversations->getCollection()->transform(
            fn (Conversation $conversation) => $this->conversationPayload($conversation)
        );

        return $this->successResponse([
            'conversations' => $conversations,
        ], 'Conversations retrieved successfully.');
    }

    public function show(Request $request, Conversation $conversation)
    {
        if (! $this->userCanAccessConversation($request->user(), $conversation)) {
            return $this->errorResponse('Conversation not found.', [], 404);
        }

        $validator = Validator::make($request->all(), [
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $validated = $validator->validated();
        $conversation->load($this->conversationRelations());
        $this->loadLatestMessages(new EloquentCollection([$conversation]));
        $conversation->loadCount([
            'messages as unread_count' => fn (Builder $query) => $query
                ->where('recipient_id', $request->user()->id)
                ->whereNull('read_at'),
        ]);

        $messages = $conversation->messages()
            ->with($this->messageRelations())
            ->orderBy('created_at')
            ->paginate($validated['per_page'] ?? 50)
            ->withQueryString();
        $messages->getCollection()->transform(
            fn (Message $message) => $this->messagePayload($message)
        );

        return $this->successResponse([
            'conversation' => $this->conversationPayload($conversation),
            'messages' => $messages,
        ], 'Conversation messages retrieved successfully.');
    }

    public function storeConversation(Request $request)
    {
        $staff = $request->user();

        if ($staff->role !== 'staff') {
            return $this->errorResponse('Only staff can start citizen conversations.', [], 403);
        }

        $validator = Validator::make($request->all(), [
            'recipient_id' => ['required', 'uuid', 'exists:users,id'],
            'incident_id' => ['nullable', 'uuid', 'exists:incidents,id'],
            'type' => ['nullable', 'in:incident,direct'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $validated = $validator->validated();
        $citizen = User::query()
            ->where('role', 'citizen')
            ->find($validated['recipient_id']);

        if (! $citizen) {
            return $this->errorResponse('Citizen not found.', [], 404);
        }

        $incident = null;
        if (! empty($validated['incident_id'])) {
            $incident = Incident::query()->find($validated['incident_id']);
        }

        $type = $incident ? 'incident' : (string) ($validated['type'] ?? 'direct');

        if ($type === 'incident' && ! $incident) {
            return $this->errorResponse('An incident id is required for an incident conversation.', [
                'incident_id' => ['An incident id is required for an incident conversation.'],
            ], 422);
        }

        if (! $this->staffCanMessageCitizen($staff, $citizen, $incident)) {
            return $this->errorResponse('This citizen is not available for this incident thread.', [], 403);
        }

        $conversation = DB::transaction(function () use ($staff, $citizen, $incident, $type): Conversation {
            if ($incident) {
                $conversation = Conversation::query()->firstOrCreate([
                    'incident_id' => $incident->id,
                    'type' => 'incident',
                ]);
            } else {
                $conversation = $this->findDirectConversation($staff, $citizen);

                if (! $conversation) {
                    $conversation = Conversation::query()->create([
                        'incident_id' => null,
                        'type' => $type,
                    ]);
                }
            }

            $conversation->participants()->syncWithoutDetaching([$staff->id, $citizen->id]);
            $conversation->touch();

            return $conversation;
        });

        $conversation->load($this->conversationRelations());
        $this->loadLatestMessages(new EloquentCollection([$conversation]));
        $conversation->loadCount([
            'messages as unread_count' => fn (Builder $query) => $query
                ->where('recipient_id', $staff->id)
                ->whereNull('read_at'),
        ]);

        return $this->successResponse([
            'conversation' => $this->conversationPayload($conversation),
        ], 'Conversation ready.', $conversation->wasRecentlyCreated ? 201 : 200);
    }

    public function storeMessage(Request $request, Conversation $conversation)
    {
        $sender = $request->user();

        if (! $this->userCanAccessConversation($sender, $conversation)) {
            return $this->errorResponse('Conversation not found.', [], 404);
        }

        $validator = Validator::make($request->all(), [
            'body' => ['required', 'string', 'min:1', 'max:2000'],
            'recipient_id' => ['nullable', 'uuid', 'exists:users,id'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $validated = $validator->validated();
        $body = trim((string) $validated['body']);

        if ($body === '') {
            return $this->errorResponse('Validation failed.', [
                'body' => ['The message body field is required.'],
            ], 422);
        }

        $conversation->loadMissing('participants:id,full_name,email,phone,barangay,role,status');
        $recipient = $this->messageRecipient($conversation, $sender, $validated['recipient_id'] ?? null);

        if (! $recipient) {
            return $this->errorResponse('A valid conversation recipient is required.', [], 422);
        }

        $message = DB::transaction(function () use ($conversation, $sender, $recipient, $body): Message {
            $message = Message::query()->create([
                'conversation_id' => $conversation->id,
                'sender_id' => $sender->id,
                'recipient_id' => $recipient->id,
                'incident_id' => $conversation->incident_id,
                'body' => $body,
                'created_at' => now(),
            ]);

            $conversation->touch();

            return $message;
        });

        $message->load($this->messageRelations());
        $this->notifyRecipient($message, $conversation, $sender, $recipient);

        return $this->successResponse([
            'message' => $this->messagePayload($message),
        ], 'Message sent successfully.', 201);
    }

    public function markRead(Request $request, Message $message)
    {
        $user = $request->user();
        $message->loadMissing('conversation.participants:id');

        if (! $this->userCanAccessConversation($user, $message->conversation)) {
            return $this->errorResponse('Message not found.', [], 404);
        }

        if ($message->recipient_id !== $user->id) {
            return $this->errorResponse('Only the recipient can mark this message as read.', [], 403);
        }

        if (! $message->read_at) {
            $message->forceFill(['read_at' => now()])->save();
        }

        $message->load($this->messageRelations());

        return $this->successResponse([
            'message' => $this->messagePayload($message),
        ], 'Message marked as read.');
    }

    /**
     * @return array<int, string>
     */
    private function conversationRelations(): array
    {
        return [
            'incident:id,reference_code,type,status,address_label,reporter_id',
            'participants:id,full_name,email,phone,barangay,role,status',
        ];
    }

    private function loadLatestMessages(EloquentCollection $conversations): void
    {
        $conversationIds = $conversations
            ->pluck('id')
            ->filter()
            ->values();

        if ($conversationIds->isEmpty()) {
            return;
        }

        $latestMessages = Message::query()
            ->whereIn('conversation_id', $conversationIds)
            ->with($this->messageRelations())
            ->orderBy('conversation_id')
            ->orderByDesc('created_at')
            ->get()
            ->groupBy('conversation_id')
            ->map(fn (EloquentCollection $messages): ?Message => $messages->first());

        $conversations->each(function (Conversation $conversation) use ($latestMessages): void {
            $conversation->setRelation('latestMessage', $latestMessages->get($conversation->id));
        });
    }

    /**
     * @return array<int, string>
     */
    private function messageRelations(): array
    {
        return [
            'sender:id,full_name,role',
            'recipient:id,full_name,role',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function conversationPayload(Conversation $conversation): array
    {
        return [
            'id' => $conversation->id,
            'incident_id' => $conversation->incident_id,
            'type' => $conversation->type,
            'created_at' => $conversation->created_at?->toIso8601String(),
            'updated_at' => $conversation->updated_at?->toIso8601String(),
            'unread_count' => (int) ($conversation->unread_count ?? 0),
            'incident' => $conversation->relationLoaded('incident') && $conversation->incident ? [
                'id' => $conversation->incident->id,
                'reference_code' => $conversation->incident->reference_code,
                'type' => $conversation->incident->type,
                'status' => $conversation->incident->status,
                'address_label' => $conversation->incident->address_label,
                'reporter_id' => $conversation->incident->reporter_id,
            ] : null,
            'participants' => $conversation->relationLoaded('participants')
                ? $conversation->participants->map(fn (User $participant) => [
                    'id' => $participant->id,
                    'full_name' => $participant->full_name,
                    'email' => $participant->email,
                    'phone' => $participant->phone,
                    'barangay' => $participant->barangay,
                    'role' => $participant->role,
                    'status' => $participant->status,
                ])->values()->all()
                : [],
            'latest_message' => $conversation->relationLoaded('latestMessage') && $conversation->latestMessage
                ? $this->messagePayload($conversation->latestMessage)
                : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function messagePayload(Message $message): array
    {
        return [
            'id' => $message->id,
            'conversation_id' => $message->conversation_id,
            'incident_id' => $message->incident_id,
            'body' => $message->body,
            'read_at' => $message->read_at?->toIso8601String(),
            'created_at' => $message->created_at?->toIso8601String(),
            'sender' => $message->relationLoaded('sender') && $message->sender ? [
                'id' => $message->sender->id,
                'full_name' => $message->sender->full_name,
                'role' => $message->sender->role,
            ] : null,
            'recipient' => $message->relationLoaded('recipient') && $message->recipient ? [
                'id' => $message->recipient->id,
                'full_name' => $message->recipient->full_name,
                'role' => $message->recipient->role,
            ] : null,
        ];
    }

    private function findDirectConversation(User $staff, User $citizen): ?Conversation
    {
        return Conversation::query()
            ->whereNull('incident_id')
            ->where('type', 'direct')
            ->whereHas('participants', fn (Builder $query) => $query->where('users.id', $staff->id))
            ->whereHas('participants', fn (Builder $query) => $query->where('users.id', $citizen->id))
            ->first();
    }

    private function userCanAccessConversation(User $user, Conversation $conversation): bool
    {
        if ($conversation->relationLoaded('participants')) {
            return $conversation->participants->contains('id', $user->id);
        }

        return $conversation->participants()
            ->where('users.id', $user->id)
            ->exists();
    }

    private function staffCanMessageCitizen(User $staff, User $citizen, ?Incident $incident): bool
    {
        if ($staff->role !== 'staff' || $citizen->role !== 'citizen') {
            return false;
        }

        if ($incident) {
            if (! $this->staffIsAssignedToIncident($staff, $incident)) {
                return false;
            }

            return $incident->reporter_id === $citizen->id
                || $incident->assignments()->where('staff_id', $citizen->id)->exists()
                || EmergencyProfile::query()->where('user_id', $citizen->id)->exists();
        }

        return Incident::query()
            ->whereHas('assignments', fn (Builder $query) => $query->where('staff_id', $staff->id))
            ->where(function (Builder $query) use ($citizen): void {
                $query
                    ->where('reporter_id', $citizen->id)
                    ->orWhereHas('assignments', fn (Builder $assignmentQuery) => $assignmentQuery->where('staff_id', $citizen->id));
            })
            ->exists()
            || EmergencyProfile::query()->where('user_id', $citizen->id)->exists();
    }

    private function staffIsAssignedToIncident(User $staff, Incident $incident): bool
    {
        return $incident->assignments()
            ->where('staff_id', $staff->id)
            ->exists();
    }

    private function messageRecipient(Conversation $conversation, User $sender, ?string $recipientId): ?User
    {
        $participants = $conversation->participants;

        if ($recipientId) {
            return $participants
                ->where('id', $recipientId)
                ->where('id', '!=', $sender->id)
                ->first();
        }

        if ($sender->role === 'staff') {
            $citizen = $participants
                ->where('role', 'citizen')
                ->where('id', '!=', $sender->id)
                ->first();

            if ($citizen) {
                return $citizen;
            }
        }

        if ($sender->role === 'citizen') {
            $latestStaffSenderId = Message::query()
                ->where('conversation_id', $conversation->id)
                ->where('sender_id', '!=', $sender->id)
                ->whereHas('sender', fn (Builder $query) => $query->where('role', 'staff'))
                ->latest('created_at')
                ->value('sender_id');

            if ($latestStaffSenderId) {
                $latestStaffSender = $participants->firstWhere('id', $latestStaffSenderId);

                if ($latestStaffSender) {
                    return $latestStaffSender;
                }
            }

            $staff = $participants
                ->where('role', 'staff')
                ->where('id', '!=', $sender->id)
                ->first();

            if ($staff) {
                return $staff;
            }
        }

        return $participants
            ->where('id', '!=', $sender->id)
            ->first();
    }

    private function notifyRecipient(Message $message, Conversation $conversation, User $sender, User $recipient): void
    {
        $preview = Str::limit($message->body, 140);
        $notification = Notification::query()->create([
            'user_id' => $recipient->id,
            'title' => "New message from {$sender->full_name}",
            'message' => $preview,
            'link' => $this->conversationLink($conversation, $recipient),
            'channel' => 'in_app',
            'is_read' => false,
            'created_at' => now(),
        ]);

        Cache::forget("notifications.unread.{$recipient->id}.v2");

        event(NotificationCreated::fromNotification($notification, [
            $this->notificationBroadcastChannel($recipient),
        ]));
    }

    private function conversationLink(Conversation $conversation, User $recipient): string
    {
        if ($conversation->incident_id && $recipient->role === 'staff') {
            return "/staff/incidents/{$conversation->incident_id}?conversation={$conversation->id}";
        }

        if ($conversation->incident_id && $recipient->role === 'citizen') {
            return "/my-reports?incident={$conversation->incident_id}&conversation={$conversation->id}";
        }

        return "/dashboard?conversation={$conversation->id}";
    }

    private function notificationBroadcastChannel(User $recipient): string
    {
        return match ($recipient->role) {
            'admin' => 'admin.notifications',
            'staff' => "staff.{$recipient->id}",
            default => "incidents.{$recipient->id}",
        };
    }
}

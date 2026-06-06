<?php

namespace Tests\Feature\Api\V1;

use App\Events\NotificationCreated;
use App\Models\Conversation;
use App\Models\Incident;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MessageControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_can_start_incident_conversation_and_message_reporter(): void
    {
        Event::fake([NotificationCreated::class]);

        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');
        $incident = $this->createAssignedIncident($reporter, $staff, $admin);

        Sanctum::actingAs($staff);

        $conversationResponse = $this->postJson('/api/v1/messages/conversations', [
            'incident_id' => $incident->id,
            'recipient_id' => $reporter->id,
        ]);

        $conversationResponse
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.conversation.incident_id', $incident->id);

        $conversationId = $conversationResponse->json('data.conversation.id');
        $this->assertDatabaseHas('conversation_participants', [
            'conversation_id' => $conversationId,
            'user_id' => $staff->id,
        ]);
        $this->assertDatabaseHas('conversation_participants', [
            'conversation_id' => $conversationId,
            'user_id' => $reporter->id,
        ]);

        $messageResponse = $this->postJson("/api/v1/messages/conversations/{$conversationId}/messages", [
            'body' => 'Please move to a safe, visible area. Responders are nearby.',
        ]);

        $messageResponse
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.message.sender.id', $staff->id)
            ->assertJsonPath('data.message.recipient.id', $reporter->id);

        $this->assertDatabaseHas('messages', [
            'conversation_id' => $conversationId,
            'sender_id' => $staff->id,
            'recipient_id' => $reporter->id,
            'incident_id' => $incident->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $reporter->id,
            'channel' => 'in_app',
            'is_read' => false,
        ]);
        Event::assertDispatched(NotificationCreated::class);
    }

    public function test_citizen_can_reply_to_participant_conversation(): void
    {
        Event::fake([NotificationCreated::class]);

        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');
        $incident = $this->createAssignedIncident($reporter, $staff, $admin);
        $conversation = $this->createConversation($incident, [$staff, $reporter]);

        Sanctum::actingAs($reporter);

        $response = $this->postJson("/api/v1/messages/conversations/{$conversation->id}/messages", [
            'body' => 'We are outside the front gate.',
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.message.sender.id', $reporter->id)
            ->assertJsonPath('data.message.recipient.id', $staff->id);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $staff->id,
            'channel' => 'in_app',
            'is_read' => false,
        ]);
    }

    public function test_unassigned_staff_cannot_start_incident_conversation(): void
    {
        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');
        $otherStaff = $this->createUser(role: 'staff', status: 'verified', email: 'other-staff@example.com');
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');
        $incident = $this->createAssignedIncident($reporter, $otherStaff, $admin);

        Sanctum::actingAs($staff);

        $response = $this->postJson('/api/v1/messages/conversations', [
            'incident_id' => $incident->id,
            'recipient_id' => $reporter->id,
        ]);

        $response
            ->assertForbidden()
            ->assertJsonPath('success', false);

        $this->assertDatabaseCount('conversations', 0);
    }

    public function test_recipient_can_mark_message_as_read(): void
    {
        $staff = $this->createUser(role: 'staff', status: 'verified', email: 'staff@example.com');
        $admin = $this->createUser(role: 'admin', status: 'verified', email: 'admin@example.com');
        $reporter = $this->createUser(role: 'citizen', status: 'verified', email: 'citizen@example.com');
        $incident = $this->createAssignedIncident($reporter, $staff, $admin);
        $conversation = $this->createConversation($incident, [$staff, $reporter]);
        $message = Message::query()->create([
            'conversation_id' => $conversation->id,
            'sender_id' => $staff->id,
            'recipient_id' => $reporter->id,
            'incident_id' => $incident->id,
            'body' => 'Please confirm your exact location.',
            'created_at' => now(),
        ]);

        Sanctum::actingAs($reporter);

        $response = $this->patchJson("/api/v1/messages/messages/{$message->id}/read");

        $response
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertNotNull($message->fresh()->read_at);
    }

    private function createConversation(Incident $incident, array $participants): Conversation
    {
        $conversation = Conversation::query()->create([
            'incident_id' => $incident->id,
            'type' => 'incident',
        ]);
        $conversation->participants()->sync(collect($participants)->pluck('id')->all());

        return $conversation;
    }

    private function createAssignedIncident(
        User $reporter,
        User $staff,
        User $assignedBy
    ): Incident {
        $incident = Incident::query()->create([
            'reporter_id' => $reporter->id,
            'type' => 'fire',
            'description' => 'Incident used in messaging feature tests.',
            'incident_datetime' => now()->subMinutes(20),
            'latitude' => 7.9062,
            'longitude' => 125.0936,
            'address_label' => 'Poblacion, Valencia City',
            'status' => 'verified',
            'is_iot_generated' => false,
        ]);

        $incident->assignments()->create([
            'staff_id' => $staff->id,
            'assigned_by' => $assignedBy->id,
            'assigned_at' => now()->subMinutes(10),
        ]);

        return $incident;
    }

    private function createUser(
        string $role,
        string $status,
        string $email,
        string $fullName = 'Sample User'
    ): User {
        return User::query()->create([
            'full_name' => $fullName,
            'email' => $email,
            'password' => 'password123',
            'phone' => '09170000999',
            'address' => 'Valencia City',
            'barangay' => 'Poblacion',
            'role' => $role,
            'status' => $status,
        ]);
    }
}

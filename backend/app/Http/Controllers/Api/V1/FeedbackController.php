<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Feedback\StoreFeedbackRequest;
use App\Models\FeedbackRating;
use App\Models\Incident;
use App\Support\ApiResponse;
use Illuminate\Support\Facades\DB;

class FeedbackController extends Controller
{
    use ApiResponse;

    public function store(StoreFeedbackRequest $request)
    {
        $user = $request->user();
        $validated = $request->validated();

        $incident = Incident::query()
            ->with(['assignments' => function ($query): void {
                $query
                    ->where('is_volunteer', false)
                    ->orderByDesc('assigned_at')
                    ->orderByDesc('created_at');
            }])
            ->whereKey($validated['incident_id'])
            ->first();

        if (! $incident) {
            return $this->errorResponse('Incident not found.', [], 404);
        }

        if ($incident->reporter_id !== $user->id) {
            return $this->errorResponse('You can only rate your own resolved incidents.', [], 403);
        }

        if ($incident->status !== 'resolved' && ! $incident->resolved_at) {
            return $this->errorResponse('Feedback can only be submitted after an incident is resolved.', [
                'incident_id' => ['This incident has not been resolved yet.'],
            ]);
        }

        $existing = FeedbackRating::query()
            ->where('incident_id', $incident->id)
            ->where('user_id', $user->id)
            ->first();

        if ($existing) {
            return $this->successResponse([
                'feedback' => $this->feedbackPayload($existing),
            ], 'Feedback was already submitted.');
        }

        $feedback = DB::transaction(function () use ($incident, $user, $validated): FeedbackRating {
            $assignment = $incident->assignments->first();

            return FeedbackRating::query()->create([
                'incident_id' => $incident->id,
                'user_id' => $user->id,
                'responder_id' => $assignment?->staff_id,
                'rating' => (int) $validated['rating'],
                'comment' => $validated['comment'] ?? null,
                'created_at' => now(),
            ]);
        });

        $feedback->load([
            'incident:id,reference_code,type,status,address_label,resolved_at',
            'user:id,full_name,email,phone',
            'responder:id,full_name,email,phone,barangay',
        ]);

        return $this->successResponse([
            'feedback' => $this->feedbackPayload($feedback),
        ], 'Feedback submitted successfully.', 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function feedbackPayload(FeedbackRating $feedback): array
    {
        return [
            'id' => $feedback->id,
            'incident_id' => $feedback->incident_id,
            'user_id' => $feedback->user_id,
            'responder_id' => $feedback->responder_id,
            'rating' => (int) $feedback->rating,
            'comment' => $feedback->comment,
            'created_at' => $feedback->created_at?->toIso8601String(),
        ];
    }
}

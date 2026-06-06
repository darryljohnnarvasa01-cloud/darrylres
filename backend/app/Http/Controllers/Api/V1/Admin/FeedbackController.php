<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\FeedbackRating;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class FeedbackController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'rating' => ['nullable', 'integer', 'between:1,5'],
            'responder_id' => ['nullable', 'uuid', 'exists:users,id'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $validated = $validator->validated();
        $perPage = (int) ($validated['per_page'] ?? 20);

        $query = FeedbackRating::query()
            ->when(isset($validated['rating']), fn ($query) => $query->where('rating', (int) $validated['rating']))
            ->when(isset($validated['responder_id']), fn ($query) => $query->where('responder_id', $validated['responder_id']));
        $summaryQuery = clone $query;

        $feedback = $query
            ->with([
                'incident:id,reference_code,type,status,address_label,resolved_at,created_at',
                'user:id,full_name,email,phone',
                'responder:id,full_name,email,phone,barangay',
            ])
            ->orderByDesc('created_at')
            ->paginate($perPage);

        $feedback->getCollection()->transform(fn (FeedbackRating $rating) => $this->feedbackPayload($rating));

        return $this->successResponse([
            'feedback' => $feedback,
            'summary' => [
                'average_rating' => round((float) (clone $summaryQuery)->avg('rating'), 2),
                'total_ratings' => (clone $summaryQuery)->count(),
            ],
        ], 'Feedback ratings retrieved successfully.');
    }

    /**
     * @return array<string, mixed>
     */
    private function feedbackPayload(FeedbackRating $feedback): array
    {
        return [
            'id' => $feedback->id,
            'rating' => (int) $feedback->rating,
            'comment' => $feedback->comment,
            'created_at' => $feedback->created_at?->toIso8601String(),
            'incident' => $feedback->incident ? [
                'id' => $feedback->incident->id,
                'reference_code' => $feedback->incident->reference_code,
                'type' => $feedback->incident->type,
                'status' => $feedback->incident->status,
                'address_label' => $feedback->incident->address_label,
                'resolved_at' => $feedback->incident->resolved_at?->toIso8601String(),
                'created_at' => $feedback->incident->created_at?->toIso8601String(),
            ] : null,
            'citizen' => $feedback->user ? [
                'id' => $feedback->user->id,
                'full_name' => $feedback->user->full_name,
                'email' => $feedback->user->email,
                'phone' => $feedback->user->phone,
            ] : null,
            'responder' => $feedback->responder ? [
                'id' => $feedback->responder->id,
                'full_name' => $feedback->responder->full_name,
                'email' => $feedback->responder->email,
                'phone' => $feedback->responder->phone,
                'barangay' => $feedback->responder->barangay,
            ] : null,
        ];
    }
}

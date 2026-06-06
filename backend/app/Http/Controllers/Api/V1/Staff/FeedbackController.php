<?php

namespace App\Http\Controllers\Api\V1\Staff;

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
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $perPage = (int) ($validator->validated()['per_page'] ?? 20);
        $userId = $request->user()->id;
        $baseQuery = FeedbackRating::query()->where('responder_id', $userId);

        $feedback = (clone $baseQuery)
            ->with([
                'incident:id,reference_code,type,status,address_label,resolved_at,created_at',
                'user:id,full_name',
            ])
            ->orderByDesc('created_at')
            ->paginate($perPage);

        $feedback->getCollection()->transform(fn (FeedbackRating $rating) => [
            'id' => $rating->id,
            'rating' => (int) $rating->rating,
            'comment' => $rating->comment,
            'created_at' => $rating->created_at?->toIso8601String(),
            'incident' => $rating->incident ? [
                'id' => $rating->incident->id,
                'reference_code' => $rating->incident->reference_code,
                'type' => $rating->incident->type,
                'status' => $rating->incident->status,
                'address_label' => $rating->incident->address_label,
                'resolved_at' => $rating->incident->resolved_at?->toIso8601String(),
                'created_at' => $rating->incident->created_at?->toIso8601String(),
            ] : null,
            'citizen' => $rating->user ? [
                'id' => $rating->user->id,
                'full_name' => $rating->user->full_name,
            ] : null,
        ]);

        return $this->successResponse([
            'feedback' => $feedback,
            'summary' => [
                'average_rating' => round((float) (clone $baseQuery)->avg('rating'), 2),
                'total_ratings' => (clone $baseQuery)->count(),
            ],
        ], 'Staff feedback ratings retrieved successfully.');
    }
}

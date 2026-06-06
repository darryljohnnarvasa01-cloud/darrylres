<?php

namespace App\Http\Requests\Feedback;

use App\Http\Requests\ApiFormRequest;

class StoreFeedbackRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'incident_id' => ['required', 'uuid', 'exists:incidents,id'],
            'rating' => ['required', 'integer', 'between:1,5'],
            'comment' => ['nullable', 'string', 'max:1000'],
        ];
    }
}

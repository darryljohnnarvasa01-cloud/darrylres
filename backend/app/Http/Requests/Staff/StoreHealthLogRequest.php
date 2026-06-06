<?php

namespace App\Http\Requests\Staff;

use App\Http\Requests\ApiFormRequest;

class StoreHealthLogRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'incident_id' => ['nullable', 'uuid'],
            'event_type' => ['required', 'string', 'max:60'],
            'severity' => ['required', 'string', 'in:info,warning,critical'],
            'payload' => ['nullable', 'array'],
            'recorded_at' => ['nullable', 'date'],
        ];
    }
}

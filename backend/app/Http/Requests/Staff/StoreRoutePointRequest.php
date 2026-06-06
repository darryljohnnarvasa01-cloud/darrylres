<?php

namespace App\Http\Requests\Staff;

use App\Http\Requests\ApiFormRequest;

class StoreRoutePointRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'incident_id' => ['required', 'uuid'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy' => ['nullable', 'numeric', 'min:0', 'max:999999'],
            'heading' => ['nullable', 'numeric', 'between:0,360'],
            'action_status' => ['nullable', 'string', 'max:40'],
        ];
    }
}

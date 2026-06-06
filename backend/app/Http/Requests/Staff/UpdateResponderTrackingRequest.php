<?php

namespace App\Http\Requests\Staff;

use App\Http\Requests\ApiFormRequest;
use App\Models\ResponderLocation;
use Illuminate\Validation\Rule;

class UpdateResponderTrackingRequest extends ApiFormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'incident_id' => ['nullable', 'uuid'],
            'action_status' => ['required', Rule::in(ResponderLocation::ACTION_STATUSES)],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy' => ['nullable', 'numeric', 'min:0', 'max:999999'],
            'heading' => ['nullable', 'numeric', 'between:0,360'],
            'battery_level' => ['nullable', 'integer', 'between:0,100'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}

<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiFormRequest;

class UpdateIotDeviceRequest extends ApiFormRequest
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
            'location_name' => ['sometimes', 'string', 'max:255'],
            'latitude' => ['sometimes', 'numeric', 'between:-90,90'],
            'longitude' => ['sometimes', 'numeric', 'between:-180,180'],
            'smoke_threshold' => ['sometimes', 'integer', 'min:1', 'max:10000'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}

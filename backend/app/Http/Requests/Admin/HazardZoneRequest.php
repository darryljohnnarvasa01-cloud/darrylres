<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiFormRequest;
use Illuminate\Validation\Rule;

class HazardZoneRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:255'],
            'type' => [$required, Rule::in(['danger', 'flood', 'evacuation'])],
            'polygon' => [$required, 'array'],
            'polygon.*' => ['nullable'],
            'description' => ['nullable', 'string', 'max:1000'],
            'capacity' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'current_occupancy' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'facilities' => ['sometimes', 'nullable', 'array'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}

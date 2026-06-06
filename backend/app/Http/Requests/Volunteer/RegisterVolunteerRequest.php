<?php

namespace App\Http\Requests\Volunteer;

use App\Http\Requests\ApiFormRequest;

class RegisterVolunteerRequest extends ApiFormRequest
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
            'volunteer_skills' => ['required', 'array', 'min:1', 'max:8'],
            'volunteer_skills.*' => ['required', 'string', 'in:fire,medical,crime,flood,accident,other,first_aid,evacuation,communications,logistics'],
            'volunteer_availability' => ['sometimes', 'boolean'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'accuracy' => ['nullable', 'numeric', 'min:0', 'max:10000'],
        ];
    }
}

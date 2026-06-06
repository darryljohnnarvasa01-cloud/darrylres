<?php

namespace App\Http\Requests\Volunteer;

use App\Http\Requests\ApiFormRequest;

class NearbyVolunteersRequest extends ApiFormRequest
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
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
            'type' => ['nullable', 'string', 'in:fire,medical,crime,flood,accident,other'],
        ];
    }
}

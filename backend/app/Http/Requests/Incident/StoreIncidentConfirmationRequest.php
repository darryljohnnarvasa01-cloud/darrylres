<?php

namespace App\Http\Requests\Incident;

use App\Http\Requests\ApiFormRequest;

class StoreIncidentConfirmationRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
        ];
    }
}

<?php

namespace App\Http\Requests\Incident;

use App\Http\Requests\ApiFormRequest;

class StoreOfflineIncidentMediaRequest extends ApiFormRequest
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
        return [
            'client_uuid' => ['required', 'uuid'],
            'media' => ['required', 'array', 'min:1', 'max:5'],
            'media.*' => ['required', 'file', 'mimes:jpeg,png,jpg,mp4,mov', 'max:10240'],
        ];
    }
}

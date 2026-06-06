<?php

namespace App\Http\Requests\Sos;

use App\Http\Requests\ApiFormRequest;

class StoreSosRequest extends ApiFormRequest
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
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'type' => ['required', 'in:sos'],
            'description' => ['required', 'string', 'min:10', 'max:255'],
        ];
    }
}

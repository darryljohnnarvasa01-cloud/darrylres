<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiFormRequest;

class VerifyIncidentRequest extends ApiFormRequest
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
            'assigned_staff_id' => [
                'required',
                'uuid',
                'exists:users,id',
            ],
        ];
    }
}

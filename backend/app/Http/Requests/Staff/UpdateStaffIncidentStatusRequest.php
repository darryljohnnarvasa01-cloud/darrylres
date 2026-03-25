<?php

namespace App\Http\Requests\Staff;

use App\Http\Requests\ApiFormRequest;

class UpdateStaffIncidentStatusRequest extends ApiFormRequest
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
            'status' => ['required', 'in:under_assessment,responding,resolved'],
            'notes' => ['required', 'string', 'min:10', 'max:2000'],
            'units_coordinated' => ['nullable', 'array'],
            'units_coordinated.*' => ['string', 'max:120'],
        ];
    }
}

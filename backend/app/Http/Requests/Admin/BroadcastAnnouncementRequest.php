<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiFormRequest;
use Illuminate\Validation\Rule;

class BroadcastAnnouncementRequest extends ApiFormRequest
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
            'title' => ['required', 'string', 'max:120'],
            'message' => ['required', 'string', 'max:500'],
            'link' => ['nullable', 'string', 'max:255'],
            'target_type' => ['nullable', 'string', Rule::in(['staff', 'all', 'barangay', 'polygon'])],
            'target_barangay' => ['nullable', 'required_if:target_type,barangay', 'string', 'max:120'],
            'target_polygon' => ['nullable', 'required_if:target_type,polygon', 'array'],
        ];
    }
}

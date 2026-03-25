<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiFormRequest;

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
        ];
    }
}

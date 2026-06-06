<?php

namespace App\Http\Requests\Incident;

use App\Http\Requests\ApiFormRequest;
use Carbon\Carbon;

class StoreIncidentRequest extends ApiFormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $incidentDateTime = $this->input('incident_datetime');

        if (! is_string($incidentDateTime) || $incidentDateTime === '') {
            return;
        }

        if (! preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/', $incidentDateTime)) {
            return;
        }

        $timezone = $this->input('client_timezone');

        if (! is_string($timezone) || ! in_array($timezone, timezone_identifiers_list(), true)) {
            return;
        }

        try {
            $this->merge([
                'incident_datetime' => Carbon::parse($incidentDateTime, $timezone)->toIso8601String(),
            ]);
        } catch (\Throwable) {
            // Let the regular validator report malformed input.
        }
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'type' => ['required', 'in:fire,medical,crime,flood,accident,other'],
            'client_uuid' => ['required_with:offline_media', 'nullable', 'uuid'],
            'description' => ['required', 'string', 'min:20', 'max:1000'],
            'incident_datetime' => ['required', 'date', 'before_or_equal:now'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'address_label' => ['required', 'string', 'max:255'],
            'media' => ['required_without:offline_media', 'array', 'min:1', 'max:5'],
            'media.*' => ['required', 'file', 'mimes:jpeg,png,jpg,mp4,mov', 'max:10240'],
            'offline_media' => ['required_without:media', 'array', 'min:1', 'max:5'],
            'offline_media.*.file_path' => ['required', 'string', 'max:500'],
            'offline_media.*.file_type' => ['required', 'in:image,video'],
            'offline_media.*.token' => ['required', 'string', 'size:64'],
            'client_timezone' => ['nullable', 'timezone'],
            'force_submit' => ['nullable', 'boolean'],
        ];
    }
}

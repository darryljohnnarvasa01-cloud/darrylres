<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\ApiResponse;

class PublicConfigController extends Controller
{
    use ApiResponse;

    public function show()
    {
        return $this->successResponse([
            'supabase' => [
                'url' => config('services.supabase.url'),
                'anon_key' => config('services.supabase.anon_key'),
            ],
            'google_maps' => [
                'api_key' => config('services.google.maps_api_key'),
            ],
        ], 'Public frontend configuration retrieved successfully.');
    }
}

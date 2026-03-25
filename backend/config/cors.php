<?php

use Illuminate\Support\Str;

if (! function_exists('cors_allowed_origins')) {
    /**
     * @return array<int, string>
     */
    function cors_allowed_origins(): array
    {
        $origins = (string) env(
            'CORS_ALLOWED_ORIGINS',
            env('FRONTEND_URL', 'http://localhost:5173').',http://127.0.0.1:5173'
        );

        return collect(explode(',', $origins))
            ->map(fn (string $origin): string => trim($origin))
            ->filter(fn (string $origin): bool => $origin !== '' && Str::startsWith($origin, 'http'))
            ->unique()
            ->values()
            ->all();
    }
}

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => cors_allowed_origins(),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,
];

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
            ->merge([
                env('FRONTEND_URL'),
                env('CLOUDFLARE_FRONTEND_URL'),
            ])
            ->filter(fn ($origin): bool => is_string($origin))
            ->map(fn (string $origin): string => trim($origin))
            ->filter(fn (string $origin): bool => $origin !== '' && Str::startsWith($origin, 'http'))
            ->unique()
            ->values()
            ->all();
    }
}

if (! function_exists('cors_allowed_origin_patterns')) {
    /**
     * @return array<int, string>
     */
    function cors_allowed_origin_patterns(): array
    {
        $patterns = (string) env('CORS_ALLOWED_ORIGIN_PATTERNS', '');

        $configured = collect(explode(',', $patterns))
            ->map(fn (string $pattern): string => trim($pattern))
            ->filter()
            ->values()
            ->all();

        if ($configured !== []) {
            return $configured;
        }

        if ((string) env('APP_ENV', 'production') === 'production') {
            return [];
        }

        return [
            '#^https?://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?$#',
            '#^https?://192\.168\.[0-9]{1,3}\.[0-9]{1,3}(:[0-9]+)?$#',
        ];
    }
}

return [
    'paths' => ['api/*', 'broadcasting/auth', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => cors_allowed_origins(),

    'allowed_origins_patterns' => cors_allowed_origin_patterns(),

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,
];

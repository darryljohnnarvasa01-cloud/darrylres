<?php

namespace App\Models\Sanctum;

use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\PersonalAccessToken as SanctumPersonalAccessToken;

class PersonalAccessToken extends SanctumPersonalAccessToken
{
    public static function findToken($token)
    {
        $ttl = (int) config('sanctum.token_cache_ttl', 0);

        if ($ttl <= 0) {
            return static::resolveToken($token);
        }

        return Cache::remember(
            static::cacheKeyForPlainTextToken($token),
            now()->addSeconds($ttl),
            fn () => static::resolveToken($token)
        );
    }

    public static function rememberPlainTextToken(string $plainTextToken, self $accessToken): void
    {
        $ttl = (int) config('sanctum.token_cache_ttl', 0);

        if ($ttl <= 0) {
            return;
        }

        Cache::put(
            static::cacheKeyForPlainTextToken($plainTextToken),
            $accessToken->loadMissing('tokenable'),
            now()->addSeconds($ttl)
        );
    }

    public static function forgetPlainTextToken(?string $plainTextToken): void
    {
        if (! $plainTextToken) {
            return;
        }

        Cache::forget(static::cacheKeyForPlainTextToken($plainTextToken));
    }

    protected static function resolveToken(string $token): ?self
    {
        $query = static::query()->with('tokenable');

        if (! str_contains($token, '|')) {
            return $query->where('token', hash('sha256', $token))->first();
        }

        [$id, $plainTextToken] = explode('|', $token, 2);
        $instance = $query->find($id);

        if (! $instance) {
            return null;
        }

        return hash_equals($instance->token, hash('sha256', $plainTextToken))
            ? $instance
            : null;
    }

    protected static function cacheKeyForPlainTextToken(string $plainTextToken): string
    {
        return 'sanctum:token:'.hash('sha256', $plainTextToken);
    }
}

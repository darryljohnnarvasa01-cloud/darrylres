<?php

use App\Http\Middleware\EnsureAbility;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\ForceHttps;
use App\Http\Middleware\IotDeviceAuth;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withBroadcasting(
        __DIR__.'/../routes/channels.php',
        ['middleware' => ['auth:sanctum']]
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->append(ForceHttps::class);
        $middleware->redirectGuestsTo(function (Request $request) {
            if ($request->is('api/*') || $request->is('broadcasting/auth') || $request->expectsJson()) {
                return null;
            }

            return (string) config('app.frontend_url', '/');
        });
        $middleware->alias([
            'ability' => EnsureAbility::class,
            'role' => EnsureRole::class,
            'iot.device' => IotDeviceAuth::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (AuthenticationException $exception, Request $request) {
            if ($request->is('api/*') || $request->is('broadcasting/auth') || $request->expectsJson()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                    'errors' => [],
                ], 401);
            }

            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
                'errors' => [],
            ], 401);
        });

        $exceptions->render(function (TokenMismatchException $exception, Request $request) {
            if ($request->is('api/*') || $request->is('broadcasting/auth') || $request->expectsJson()) {
                return response()->json([
                    'success' => false,
                    'message' => 'CSRF token mismatch. This API accepts bearer-token authentication; retry the request without session login cookies.',
                    'errors' => [],
                ], 419);
            }

            return null;
        });
    })->create();

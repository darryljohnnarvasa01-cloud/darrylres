<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

class EnsureAbility
{
    /**
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next, string $ability): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'success' => false,
                'errors' => ['auth' => ['Unauthenticated.']],
                'message' => 'Authentication is required.',
            ], 401);
        }

        if (! Gate::forUser($user)->allows($ability)) {
            return response()->json([
                'success' => false,
                'errors' => ['permission' => ['Forbidden for this action.']],
                'message' => 'You do not have permission to access this resource.',
            ], 403);
        }

        return $next($request);
    }
}

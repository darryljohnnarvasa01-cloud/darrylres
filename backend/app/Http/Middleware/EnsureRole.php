<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'success' => false,
                'errors' => ['auth' => ['Unauthenticated.']],
                'message' => 'Authentication is required.',
            ], 401);
        }

        $allowed = in_array($user->role, $roles, true)
            || (in_array('admin', $roles, true) && $user->role === 'admin')
            || (in_array('admin', $roles, true) && $user->canUseFallbackAdminAccess());

        if (! $allowed) {
            return response()->json([
                'success' => false,
                'errors' => ['role' => ['Forbidden for this role.']],
                'message' => 'You are not allowed to access this resource.',
            ], 403);
        }

        return $next($request);
    }
}

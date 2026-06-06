<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ForceHttps
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $host = $request->getHost();
        $isLocalHost = in_array($host, ['127.0.0.1', 'localhost', '::1'], true);
        $forceHttps = filter_var(env('FORCE_HTTPS', app()->isProduction()), FILTER_VALIDATE_BOOL);

        if ($forceHttps && ! $isLocalHost && ! $request->secure()) {
            return redirect()->secure($request->getRequestUri());
        }

        return $next($request);
    }
}

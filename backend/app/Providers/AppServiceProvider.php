<?php

namespace App\Providers;

use App\Events\NotificationCreated;
use App\Listeners\SendNotificationEmail;
use App\Models\Sanctum\PersonalAccessToken;
use App\Models\User;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Register notification email listener
        Event::listen(NotificationCreated::class, SendNotificationEmail::class);

        Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);

        RateLimiter::for('guest-reports', function (Request $request) {
            $browserId = (string) $request->header('X-RescueLink-Guest-Id', '');
            $key = hash('sha256', $request->ip().'|'.$request->userAgent().'|'.$browserId);

            return Limit::perMinute(3)->by($key);
        });

        RateLimiter::for('sos-alerts', function (Request $request) {
            $browserId = (string) $request->header('X-RescueLink-Guest-Id', '');
            $key = hash('sha256', 'sos|'.$request->ip().'|'.$request->userAgent().'|'.$browserId);

            return Limit::perMinute(2)->by($key);
        });

        RateLimiter::for('crowdsource', function (Request $request) {
            $browserId = (string) $request->header('X-RescueLink-Guest-Id', '');
            $userKey = $request->user()?->id ?? '';
            $key = hash('sha256', 'crowdsource|'.$request->ip().'|'.$request->userAgent().'|'.$browserId.'|'.$userKey);

            return Limit::perMinute(5)->by($key);
        });

        foreach (User::ADMIN_ABILITIES as $ability) {
            Gate::define($ability, fn (User $user) => $user->hasAbility($ability));
        }
    }
}

<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class GuestReportLimiter
{
    public function limit(): int
    {
        return max(1, (int) env('GUEST_REPORT_LIMIT', 10));
    }

    /**
     * @return array<string, mixed>
     */
    public function quota(Request $request): array
    {
        $identity = $this->identity($request);
        $used = (int) (DB::table('guest_report_usages')
            ->where('guest_identifier', $identity['guest_identifier'])
            ->value('reports_count') ?? 0);

        return $this->quotaPayload($identity, $used);
    }

    /**
     * Reserve one guest report slot. Call this inside the same transaction that
     * creates the incident so concurrent submits cannot pass the limit.
     *
     * @return array<string, mixed>
     */
    public function consume(Request $request): array
    {
        $identity = $this->identity($request);
        $now = now();

        DB::table('guest_report_usages')->insertOrIgnore([
            'guest_identifier' => $identity['guest_identifier'],
            'ip_hash' => $identity['ip_hash'],
            'user_agent_hash' => $identity['user_agent_hash'],
            'reports_count' => 0,
            'first_reported_at' => $now,
            'last_reported_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $usage = DB::table('guest_report_usages')
            ->where('guest_identifier', $identity['guest_identifier'])
            ->lockForUpdate()
            ->first();

        $used = (int) ($usage?->reports_count ?? 0);

        if ($used >= $this->limit()) {
            return [
                ...$this->quotaPayload($identity, $used),
                'allowed' => false,
            ];
        }

        $nextUsed = $used + 1;

        DB::table('guest_report_usages')
            ->where('guest_identifier', $identity['guest_identifier'])
            ->update([
                'ip_hash' => $identity['ip_hash'],
                'user_agent_hash' => $identity['user_agent_hash'],
                'reports_count' => $nextUsed,
                'last_reported_at' => $now,
                'updated_at' => $now,
            ]);

        return [
            ...$this->quotaPayload($identity, $nextUsed),
            'allowed' => true,
        ];
    }

    /**
     * @return array{guest_identifier: string, ip_hash: string, user_agent_hash: string}
     */
    private function identity(Request $request): array
    {
        $browserId = (string) $request->header('X-RescueLink-Guest-Id', '');
        $browserId = preg_replace('/[^a-zA-Z0-9_-]/', '', $browserId) ?: 'anonymous-browser';
        $browserId = substr($browserId, 0, 80);
        $ip = (string) $request->ip();
        $userAgent = substr((string) $request->userAgent(), 0, 255);
        $secret = (string) config('app.key', 'rescuelink');

        return [
            'guest_identifier' => hash('sha256', "{$browserId}|{$ip}|{$userAgent}|{$secret}"),
            'ip_hash' => hash('sha256', "{$ip}|{$secret}"),
            'user_agent_hash' => hash('sha256', "{$userAgent}|{$secret}"),
        ];
    }

    /**
     * @param  array<string, string>  $identity
     * @return array<string, mixed>
     */
    private function quotaPayload(array $identity, int $used): array
    {
        $limit = $this->limit();

        return [
            'limit' => $limit,
            'used' => min($used, $limit),
            'remaining' => max(0, $limit - $used),
            'limit_reached' => $used >= $limit,
            'guest_identifier' => $identity['guest_identifier'],
        ];
    }
}

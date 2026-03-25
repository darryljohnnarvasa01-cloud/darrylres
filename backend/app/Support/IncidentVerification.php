<?php

namespace App\Support;

use SimpleSoftwareIO\QrCode\Facades\QrCode;

class IncidentVerification
{
    public static function referenceCodeFromId(string $incidentId): string
    {
        return 'RLK-'.strtoupper(str_replace('-', '', $incidentId));
    }

    public static function verificationPath(string $referenceCode): string
    {
        return '/verify/'.strtoupper(trim($referenceCode));
    }

    public static function verificationUrl(string $referenceCode): string
    {
        $base = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return $base.self::verificationPath($referenceCode);
    }

    public static function qrCodeSvgDataUri(string $referenceCode): string
    {
        $svg = QrCode::format('svg')
            ->size(300)
            ->margin(1)
            ->generate(self::verificationUrl($referenceCode));

        return 'data:image/svg+xml;base64,'.base64_encode($svg);
    }

    public static function extractBarangay(string $addressLabel): string
    {
        $segments = array_values(array_filter(array_map('trim', explode(',', $addressLabel))));

        if (empty($segments)) {
            return 'Unknown';
        }

        return $segments[0];
    }
}

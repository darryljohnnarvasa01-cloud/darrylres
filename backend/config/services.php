<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'supabase' => [
        'url' => env('SUPABASE_URL') ?: (env('SUPABASE_STORAGE_PUBLIC_URL')
            ? preg_replace('#/storage/v1/object/public/.*$#', '', env('SUPABASE_STORAGE_PUBLIC_URL'))
            : null),
        'anon_key' => env('SUPABASE_ANON_KEY') ?: env('SUPABASE_STORAGE_ACCESS_KEY_ID'),
        'service_role_key' => env('SUPABASE_SERVICE_ROLE_KEY'),
    ],

    'google' => [
        'maps_api_key' => env('GOOGLE_MAPS_API_KEY'),
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect_uri' => env('GOOGLE_REDIRECT_URI'),
    ],

    'google_drive' => [
        'client_config' => env('GOOGLE_DRIVE_CLIENT_CONFIG'),
        'redirect_uri' => env('GOOGLE_DRIVE_REDIRECT_URI'),
        'backup_folder_id' => env('GOOGLE_DRIVE_BACKUP_FOLDER_ID'),
    ],

];

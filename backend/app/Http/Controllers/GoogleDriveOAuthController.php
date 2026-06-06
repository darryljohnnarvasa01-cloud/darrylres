<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class GoogleDriveOAuthController extends Controller
{
    public function callback(Request $request)
    {
        if ($request->filled('error')) {
            return response()->json([
                'success' => false,
                'message' => 'Google Drive authorization failed.',
                'error' => $request->query('error'),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Google Drive authorization code received. Exchange this code on the server and store the resulting refresh token in GOOGLE_DRIVE_CLIENT_CONFIG.',
            'code' => $request->query('code'),
            'state' => $request->query('state'),
        ]);
    }
}

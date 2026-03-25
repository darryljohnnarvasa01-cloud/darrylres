<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;

trait ApiResponse
{
    protected function successResponse(mixed $data = null, string $message = '', int $status = 200): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $data ?? (object) [],
            'message' => $message,
        ], $status);
    }

    protected function errorResponse(string $message, array $errors = [], int $status = 422): JsonResponse
    {
        return response()->json([
            'success' => false,
            'errors' => (object) $errors,
            'message' => $message,
        ], $status);
    }
}

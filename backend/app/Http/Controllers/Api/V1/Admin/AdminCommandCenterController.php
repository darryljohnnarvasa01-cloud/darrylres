<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\Admin\CommandCenterService;
use App\Support\ApiResponse;

class AdminCommandCenterController extends Controller
{
    use ApiResponse;

    public function show(CommandCenterService $commandCenter)
    {
        return $this->successResponse(
            $commandCenter->snapshot(),
            'Command center data retrieved successfully.'
        );
    }
}

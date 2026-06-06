<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hazard_zones', function (Blueprint $table): void {
            $table->unsignedInteger('capacity')->nullable()->after('description');
            $table->unsignedInteger('current_occupancy')->nullable()->default(0)->after('capacity');
            $table->jsonb('facilities')->nullable()->after('current_occupancy');
        });
    }

    public function down(): void
    {
        Schema::table('hazard_zones', function (Blueprint $table): void {
            $table->dropColumn(['capacity', 'current_occupancy', 'facilities']);
        });
    }
};

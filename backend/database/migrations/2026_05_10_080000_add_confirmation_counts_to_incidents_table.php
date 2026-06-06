<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table): void {
            $table->unsignedInteger('confirmations_count')->default(0)->after('ai_risk_score');
            $table->unsignedInteger('disputes_count')->default(0)->after('confirmations_count');
            $table->index(['confirmations_count', 'created_at'], 'incidents_confirmations_created_idx');
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table): void {
            $table->dropIndex('incidents_confirmations_created_idx');
            $table->dropColumn(['confirmations_count', 'disputes_count']);
        });
    }
};

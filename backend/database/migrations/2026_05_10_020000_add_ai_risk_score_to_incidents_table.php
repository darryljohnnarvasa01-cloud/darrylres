<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table): void {
            $table->unsignedTinyInteger('ai_risk_score')->default(0)->after('resolved_at');
            $table->index(['ai_risk_score', 'created_at'], 'incidents_ai_risk_created_idx');
        });

        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE incidents ADD CONSTRAINT incidents_ai_risk_score_check CHECK (ai_risk_score BETWEEN 0 AND 100)');
        }
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_ai_risk_score_check');
        }

        Schema::table('incidents', function (Blueprint $table): void {
            $table->dropIndex('incidents_ai_risk_created_idx');
            $table->dropColumn('ai_risk_score');
        });
    }
};

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
            $table->boolean('is_guest')->default(false)->after('reporter_id');
            $table->string('guest_identifier', 64)->nullable()->after('is_guest');
            $table->index(['is_guest', 'guest_identifier', 'created_at'], 'incidents_guest_identifier_created_idx');
        });

        Schema::create('guest_report_usages', function (Blueprint $table): void {
            $table->string('guest_identifier', 64)->primary();
            $table->string('ip_hash', 64)->nullable();
            $table->string('user_agent_hash', 64)->nullable();
            $table->unsignedSmallInteger('reports_count')->default(0);
            $table->timestamp('first_reported_at')->nullable();
            $table->timestamp('last_reported_at')->nullable();
            $table->timestamps();

            $table->index(['ip_hash', 'last_reported_at'], 'guest_usage_ip_last_reported_idx');
            $table->index(['reports_count', 'last_reported_at'], 'guest_usage_count_last_reported_idx');
        });

        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE incidents ADD CONSTRAINT incidents_guest_reporter_check CHECK ((is_guest = true AND reporter_id IS NULL AND guest_identifier IS NOT NULL) OR (is_guest = false))');
        }
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_guest_reporter_check');
        }

        Schema::dropIfExists('guest_report_usages');

        Schema::table('incidents', function (Blueprint $table): void {
            $table->dropIndex('incidents_guest_identifier_created_idx');
            $table->dropColumn(['is_guest', 'guest_identifier']);
        });
    }
};

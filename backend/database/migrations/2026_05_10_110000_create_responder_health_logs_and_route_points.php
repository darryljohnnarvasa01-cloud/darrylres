<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('responder_health_logs', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('responder_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('incident_id')->nullable()->constrained('incidents')->nullOnDelete();
            $table->string('event_type', 60);
            $table->string('severity', 20)->default('info');
            $table->json('payload')->nullable();
            $table->timestamp('recorded_at')->useCurrent();
            $table->timestamps();

            $table->index(['responder_id', 'recorded_at']);
            $table->index(['event_type', 'recorded_at']);
            $table->index(['severity', 'recorded_at']);
        });

        Schema::create('responder_route_points', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('responder_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('incident_id')->constrained('incidents')->cascadeOnDelete();
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->decimal('accuracy', 8, 2)->nullable();
            $table->decimal('heading', 6, 2)->nullable();
            $table->string('action_status', 40)->default('on_the_way');
            $table->timestamp('recorded_at')->useCurrent();
            $table->timestamps();

            $table->index(['responder_id', 'incident_id', 'recorded_at']);
            $table->index(['incident_id', 'recorded_at']);
        });

        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement(<<<'SQL'
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_publication_tables
                            WHERE pubname = 'supabase_realtime'
                                AND schemaname = 'public'
                                AND tablename = 'responder_route_points'
                        ) THEN
                            ALTER PUBLICATION supabase_realtime ADD TABLE public.responder_route_points;
                        END IF;
                    END IF;
                END $$
            SQL);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('responder_route_points');
        Schema::dropIfExists('responder_health_logs');
    }
};

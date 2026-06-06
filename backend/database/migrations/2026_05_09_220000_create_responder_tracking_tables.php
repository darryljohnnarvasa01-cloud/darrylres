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
        Schema::create('responder_locations', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('responder_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('incident_id')->nullable()->constrained('incidents')->nullOnDelete();
            $table->string('action_status', 40)->default('accepted_request');
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->decimal('accuracy', 8, 2)->nullable();
            $table->decimal('heading', 6, 2)->nullable();
            $table->unsignedTinyInteger('battery_level')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('recorded_at')->useCurrent();
            $table->timestamps();

            $table->unique('responder_id');
            $table->index(['incident_id', 'recorded_at']);
            $table->index(['action_status', 'recorded_at']);
        });

        Schema::create('responder_status_logs', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('responder_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('incident_id')->nullable()->constrained('incidents')->nullOnDelete();
            $table->string('action_status', 40);
            $table->text('notes')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['responder_id', 'created_at']);
            $table->index(['incident_id', 'created_at']);
            $table->index(['action_status', 'created_at']);
        });

        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE responder_locations ADD CONSTRAINT responder_locations_action_status_check CHECK (action_status IN ('accepted_request', 'on_the_way', 'arrived', 'resolved', 'cancelled'))");
            DB::statement("ALTER TABLE responder_status_logs ADD CONSTRAINT responder_status_logs_action_status_check CHECK (action_status IN ('accepted_request', 'on_the_way', 'arrived', 'resolved', 'cancelled'))");
            DB::statement(<<<'SQL'
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_publication_tables
                            WHERE pubname = 'supabase_realtime'
                                AND schemaname = 'public'
                                AND tablename = 'responder_locations'
                        ) THEN
                            ALTER PUBLICATION supabase_realtime ADD TABLE public.responder_locations;
                        END IF;

                        IF NOT EXISTS (
                            SELECT 1 FROM pg_publication_tables
                            WHERE pubname = 'supabase_realtime'
                                AND schemaname = 'public'
                                AND tablename = 'responder_status_logs'
                        ) THEN
                            ALTER PUBLICATION supabase_realtime ADD TABLE public.responder_status_logs;
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
        Schema::dropIfExists('responder_status_logs');
        Schema::dropIfExists('responder_locations');
    }
};

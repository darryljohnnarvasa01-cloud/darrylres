<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('feedback_ratings', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('incident_id')->constrained('incidents')->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('responder_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->text('comment')->nullable();
            $table->timestamp('created_at', 0)->useCurrent();

            $table->unique(['incident_id', 'user_id']);
            $table->index(['responder_id', 'created_at']);
            $table->index(['rating', 'created_at']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('feedback_ratings');
    }
};

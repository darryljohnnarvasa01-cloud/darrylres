<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('broadcasts', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('title');
            $table->text('message');
            $table->string('link')->nullable();
            $table->enum('target_type', ['staff', 'all', 'barangay', 'polygon'])->default('staff');
            $table->string('target_barangay')->nullable();
            $table->jsonb('target_polygon')->nullable();
            $table->foreignUuid('sent_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at', 0)->useCurrent();

            $table->index(['target_type', 'created_at']);
            $table->index(['target_barangay', 'created_at']);
            $table->index(['sent_by', 'created_at']);
        });

        Schema::create('broadcast_recipients', function (Blueprint $table): void {
            $table->foreignUuid('broadcast_id')->constrained('broadcasts')->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('is_read')->default(false);
            $table->timestamp('created_at', 0)->useCurrent();

            $table->primary(['broadcast_id', 'user_id']);
            $table->index(['user_id', 'is_read', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('broadcast_recipients');
        Schema::dropIfExists('broadcasts');
    }
};

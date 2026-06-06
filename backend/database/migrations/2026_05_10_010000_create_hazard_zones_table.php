<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hazard_zones', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->enum('type', ['danger', 'flood', 'evacuation']);
            $table->jsonb('polygon');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('created_at', 0)->useCurrent();

            $table->index(['type', 'is_active']);
            $table->index(['is_active', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hazard_zones');
    }
};

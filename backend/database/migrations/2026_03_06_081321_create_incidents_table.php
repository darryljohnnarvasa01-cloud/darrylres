<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('incidents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('reporter_id')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('type', ['fire', 'medical', 'crime', 'flood', 'accident', 'other']);
            $table->text('description');
            $table->timestamp('incident_datetime');
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->string('address_label');
            $table->enum('status', [
                'pending_verification',
                'verified',
                'rejected',
                'under_assessment',
                'responding',
                'resolved',
            ])->default('pending_verification');
            $table->boolean('is_iot_generated')->default(false);
            $table->string('device_id')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamps();

            $table->index(['type', 'incident_datetime']);
            $table->index(['status', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('incidents');
    }
};

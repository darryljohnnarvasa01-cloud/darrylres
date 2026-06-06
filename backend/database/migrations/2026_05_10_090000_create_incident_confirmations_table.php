<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('incident_confirmations', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('incident_id')->constrained('incidents')->onDelete('cascade');
            $table->foreignUuid('user_id')->nullable()->constrained('users')->onDelete('cascade');
            $table->string('guest_identifier', 64)->nullable();
            $table->enum('type', ['confirm', 'dispute']);
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['incident_id', 'user_id'], 'incident_confirmations_incident_user_unique');
            $table->unique(['incident_id', 'guest_identifier'], 'incident_confirmations_incident_guest_unique');
            $table->index(['incident_id', 'type'], 'incident_confirmations_incident_type_idx');
            $table->index(['guest_identifier', 'created_at'], 'incident_confirmations_guest_created_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('incident_confirmations');
    }
};

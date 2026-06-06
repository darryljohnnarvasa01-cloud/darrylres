<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table): void {
            $table->string('channel', 30)->default('in_app');
            $table->index(['user_id', 'channel', 'is_read', 'created_at'], 'notifications_user_channel_read_created_idx');
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table): void {
            $table->dropIndex('notifications_user_channel_read_created_idx');
            $table->dropColumn('channel');
        });
    }
};

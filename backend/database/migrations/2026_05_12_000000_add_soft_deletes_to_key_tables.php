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
        // Core tables that should retain data for audit purposes
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        Schema::table('incidents', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        Schema::table('incident_media', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        Schema::table('incident_logs', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        Schema::table('incident_assignments', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        Schema::table('incident_confirmations', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        // IoT and safety tables
        Schema::table('iot_devices', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        Schema::table('sos_alerts', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        Schema::table('hazard_zones', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        // Responder tracking tables
        Schema::table('responder_locations', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        Schema::table('responder_status_logs', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        Schema::table('responder_health_logs', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        Schema::table('responder_route_points', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        // Communication tables
        Schema::table('notifications', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        Schema::table('broadcasts', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        // User profile and feedback tables
        Schema::table('emergency_profiles', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        Schema::table('feedback_ratings', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });

        // Email notifications (for audit trail)
        Schema::table('email_notifications', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index(['deleted_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Remove soft delete columns and indexes
        $tables = [
            'users',
            'incidents',
            'incident_media',
            'incident_logs',
            'incident_assignments',
            'incident_confirmations',
            'iot_devices',
            'sos_alerts',
            'hazard_zones',
            'responder_locations',
            'responder_status_logs',
            'responder_health_logs',
            'responder_route_points',
            'notifications',
            'broadcasts',
            'conversations',
            'messages',
            'emergency_profiles',
            'feedback_ratings',
            'email_notifications'
        ];

        foreach ($tables as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->dropIndex(['deleted_at']);
                $table->dropColumn('deleted_at');
            });
        }
    }
};

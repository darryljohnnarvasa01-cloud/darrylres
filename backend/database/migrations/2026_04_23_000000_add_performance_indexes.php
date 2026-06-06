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
        Schema::table('users', function (Blueprint $table): void {
            $table->index(['role', 'status', 'full_name'], 'users_role_status_name_idx');
            $table->index(['status', 'created_at'], 'users_status_created_idx');
        });

        Schema::table('incidents', function (Blueprint $table): void {
            $table->index(['created_at'], 'incidents_created_idx');
            $table->index(['reporter_id', 'status', 'created_at'], 'incidents_reporter_status_created_idx');
            $table->index(['status', 'type', 'created_at'], 'incidents_status_type_created_idx');
            $table->index(['is_iot_generated', 'status', 'created_at'], 'incidents_iot_status_created_idx');
            $table->index(['resolved_at'], 'incidents_resolved_idx');
        });

        Schema::table('incident_assignments', function (Blueprint $table): void {
            $table->index(['incident_id', 'staff_id'], 'assignments_incident_staff_idx');
            $table->index(['incident_id', 'created_at'], 'assignments_incident_created_idx');
        });

        Schema::table('incident_logs', function (Blueprint $table): void {
            $table->index(['incident_id', 'new_status', 'created_at'], 'logs_incident_status_created_idx');
            $table->index(['new_status', 'created_at'], 'logs_status_created_idx');
            $table->index(['changed_by', 'created_at'], 'logs_changed_created_idx');
        });

        Schema::table('notifications', function (Blueprint $table): void {
            $table->index(['is_read', 'created_at'], 'notifications_read_created_idx');
        });

        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->index(['entity_type', 'entity_id', 'created_at'], 'audit_entity_created_idx');
        });

        Schema::table('personal_access_tokens', function (Blueprint $table): void {
            $table->index(['tokenable_type', 'tokenable_id', 'last_used_at'], 'tokens_tokenable_seen_idx');
        });

        Schema::table('iot_devices', function (Blueprint $table): void {
            $table->index(['last_ping_at'], 'iot_last_ping_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('iot_devices', function (Blueprint $table): void {
            $table->dropIndex('iot_last_ping_idx');
        });

        Schema::table('personal_access_tokens', function (Blueprint $table): void {
            $table->dropIndex('tokens_tokenable_seen_idx');
        });

        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->dropIndex('audit_entity_created_idx');
        });

        Schema::table('notifications', function (Blueprint $table): void {
            $table->dropIndex('notifications_read_created_idx');
        });

        Schema::table('incident_logs', function (Blueprint $table): void {
            $table->dropIndex('logs_incident_status_created_idx');
            $table->dropIndex('logs_status_created_idx');
            $table->dropIndex('logs_changed_created_idx');
        });

        Schema::table('incident_assignments', function (Blueprint $table): void {
            $table->dropIndex('assignments_incident_staff_idx');
            $table->dropIndex('assignments_incident_created_idx');
        });

        Schema::table('incidents', function (Blueprint $table): void {
            $table->dropIndex('incidents_created_idx');
            $table->dropIndex('incidents_reporter_status_created_idx');
            $table->dropIndex('incidents_status_type_created_idx');
            $table->dropIndex('incidents_iot_status_created_idx');
            $table->dropIndex('incidents_resolved_idx');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex('users_role_status_name_idx');
            $table->dropIndex('users_status_created_idx');
        });
    }
};

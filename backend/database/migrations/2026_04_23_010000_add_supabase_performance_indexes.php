<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        DB::statement('CREATE INDEX IF NOT EXISTS incidents_created_desc_idx ON incidents (created_at DESC)');
        DB::statement('CREATE INDEX IF NOT EXISTS incidents_status_created_desc_idx ON incidents (status, created_at DESC)');
        DB::statement('CREATE INDEX IF NOT EXISTS incidents_type_created_desc_idx ON incidents (type, created_at DESC)');
        DB::statement('CREATE INDEX IF NOT EXISTS incidents_status_type_created_desc_idx ON incidents (status, type, created_at DESC)');
        DB::statement("CREATE INDEX IF NOT EXISTS incidents_active_created_desc_idx ON incidents (created_at DESC) WHERE status IN ('pending_verification', 'verified', 'under_assessment', 'responding')");
        DB::statement("CREATE INDEX IF NOT EXISTS incidents_resolved_created_desc_idx ON incidents (created_at DESC) WHERE status = 'resolved'");
        DB::statement('CREATE INDEX IF NOT EXISTS incidents_reference_code_trgm_idx ON incidents USING gin (reference_code gin_trgm_ops)');
        DB::statement('CREATE INDEX IF NOT EXISTS incidents_id_text_trgm_idx ON incidents USING gin ((id::text) gin_trgm_ops)');
        DB::statement('CREATE INDEX IF NOT EXISTS users_full_name_trgm_idx ON users USING gin (full_name gin_trgm_ops)');
        DB::statement('CREATE INDEX IF NOT EXISTS users_role_status_full_name_idx ON users (role, status, full_name)');
        DB::statement('CREATE INDEX IF NOT EXISTS assignments_staff_incident_idx ON incident_assignments (staff_id, incident_id)');
        DB::statement('CREATE INDEX IF NOT EXISTS assignments_staff_assigned_desc_idx ON incident_assignments (staff_id, assigned_at DESC)');
        DB::statement('CREATE INDEX IF NOT EXISTS assignments_incident_staff_created_desc_idx ON incident_assignments (incident_id, staff_id, created_at DESC)');
        DB::statement('CREATE INDEX IF NOT EXISTS logs_incident_changed_status_created_idx ON incident_logs (incident_id, changed_by, new_status, created_at)');
        DB::statement('CREATE INDEX IF NOT EXISTS logs_changed_status_created_idx ON incident_logs (changed_by, new_status, created_at)');
        DB::statement('CREATE INDEX IF NOT EXISTS personal_access_tokens_token_idx ON personal_access_tokens (token)');
        DB::statement('CREATE INDEX IF NOT EXISTS personal_access_tokens_tokenable_seen_idx ON personal_access_tokens (tokenable_type, tokenable_id, last_used_at)');
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        foreach ([
            'personal_access_tokens_tokenable_seen_idx',
            'personal_access_tokens_token_idx',
            'logs_changed_status_created_idx',
            'logs_incident_changed_status_created_idx',
            'assignments_incident_staff_created_desc_idx',
            'assignments_staff_assigned_desc_idx',
            'assignments_staff_incident_idx',
            'users_role_status_full_name_idx',
            'users_full_name_trgm_idx',
            'incidents_id_text_trgm_idx',
            'incidents_reference_code_trgm_idx',
            'incidents_resolved_created_desc_idx',
            'incidents_active_created_desc_idx',
            'incidents_status_type_created_desc_idx',
            'incidents_type_created_desc_idx',
            'incidents_status_created_desc_idx',
            'incidents_created_desc_idx',
        ] as $indexName) {
            DB::statement("DROP INDEX IF EXISTS {$indexName}");
        }
    }
};

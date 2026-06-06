-- RescueLink Supabase/PostgreSQL performance pack
-- Run this in Supabase SQL Editor after supabase-schema.sql and supabase-seeds.sql.

create extension if not exists pg_trgm;

-- Admin incident list, map, and triage filters.
create index if not exists incidents_created_desc_idx
    on public.incidents (created_at desc);

create index if not exists incidents_status_created_desc_idx
    on public.incidents (status, created_at desc);

create index if not exists incidents_type_created_desc_idx
    on public.incidents (type, created_at desc);

create index if not exists incidents_status_type_created_desc_idx
    on public.incidents (status, type, created_at desc);

create index if not exists incidents_active_created_desc_idx
    on public.incidents (created_at desc)
    where status in ('pending_verification', 'verified', 'under_assessment', 'responding');

create index if not exists incidents_resolved_created_desc_idx
    on public.incidents (created_at desc)
    where status = 'resolved';

-- Fast ILIKE search on the admin incident table.
create index if not exists incidents_reference_code_trgm_idx
    on public.incidents using gin (reference_code gin_trgm_ops);

create index if not exists incidents_id_text_trgm_idx
    on public.incidents using gin ((id::text) gin_trgm_ops);

create index if not exists users_full_name_trgm_idx
    on public.users using gin (full_name gin_trgm_ops);

create index if not exists users_role_status_full_name_idx
    on public.users (role, status, full_name);

-- Responder performance and assignment lookups.
create index if not exists assignments_staff_incident_idx
    on public.incident_assignments (staff_id, incident_id);

create index if not exists assignments_staff_assigned_desc_idx
    on public.incident_assignments (staff_id, assigned_at desc);

create index if not exists assignments_incident_staff_created_desc_idx
    on public.incident_assignments (incident_id, staff_id, created_at desc);

create index if not exists logs_incident_changed_status_created_idx
    on public.incident_logs (incident_id, changed_by, new_status, created_at);

create index if not exists logs_changed_status_created_idx
    on public.incident_logs (changed_by, new_status, created_at);

-- Sanctum bearer-token auth path.
create index if not exists personal_access_tokens_token_idx
    on public.personal_access_tokens (token);

create index if not exists personal_access_tokens_tokenable_seen_idx
    on public.personal_access_tokens (tokenable_type, tokenable_id, last_used_at);

analyze public.users;
analyze public.incidents;
analyze public.incident_assignments;
analyze public.incident_logs;
analyze public.personal_access_tokens;

insert into public.migrations (migration, batch)
select '2026_04_23_010000_add_supabase_performance_indexes', 1
where not exists (
    select 1
    from public.migrations
    where migration = '2026_04_23_010000_add_supabase_performance_indexes'
);

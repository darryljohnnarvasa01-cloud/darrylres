-- RescueLink Supabase/Postgres schema
-- Supabase CLI migration for a fresh project.
-- Non-destructive: no DROP TABLE statements are included.

create extension if not exists pgcrypto;

set search_path to public;


create table migrations (
    id bigserial primary key,
    migration varchar(255) not null,
    batch integer not null
);
create table users (
    id uuid primary key default gen_random_uuid(),
    full_name varchar(255) not null,
    email varchar(255) not null unique,
    password varchar(255) not null,
    phone varchar(255) not null,
    address varchar(255) not null,
    barangay varchar(255) not null,
    role varchar(20) not null default 'citizen'
        check (role in ('citizen', 'staff', 'admin')),
    status varchar(20) not null default 'pending'
        check (status in ('pending', 'verified', 'rejected')),
    role_permissions jsonb null,
    gov_id_image_path varchar(255) null,
    rejection_reason text null,
    remember_token varchar(100) null,
    created_at timestamp(0) without time zone null default current_timestamp,
    updated_at timestamp(0) without time zone null default current_timestamp
);

create table password_reset_tokens (
    email varchar(255) primary key,
    token varchar(255) not null,
    created_at timestamp(0) without time zone null
);

create table sessions (
    id varchar(255) primary key,
    user_id uuid null references users(id) on delete set null,
    ip_address varchar(45) null,
    user_agent text null,
    payload text not null,
    last_activity integer not null
);

create index sessions_user_id_index on sessions(user_id);
create index sessions_last_activity_index on sessions(last_activity);
create index users_role_status_name_idx on users(role, status, full_name);
create index users_status_created_idx on users(status, created_at);

create table cache (
    "key" varchar(255) primary key,
    value text not null,
    expiration integer not null
);

create table cache_locks (
    "key" varchar(255) primary key,
    owner varchar(255) not null,
    expiration integer not null
);

create table jobs (
    id bigserial primary key,
    queue varchar(255) not null,
    payload text not null,
    attempts smallint not null,
    reserved_at integer null,
    available_at integer not null,
    created_at integer not null
);

create index jobs_queue_index on jobs(queue);

create table job_batches (
    id varchar(255) primary key,
    name varchar(255) not null,
    total_jobs integer not null,
    pending_jobs integer not null,
    failed_jobs integer not null,
    failed_job_ids text not null,
    options text null,
    cancelled_at integer null,
    created_at integer not null,
    finished_at integer null
);

create table failed_jobs (
    id bigserial primary key,
    uuid varchar(255) not null unique,
    connection text not null,
    queue text not null,
    payload text not null,
    exception text not null,
    failed_at timestamp(0) without time zone not null default current_timestamp
);

create table personal_access_tokens (
    id bigserial primary key,
    tokenable_type varchar(255) not null,
    tokenable_id uuid not null,
    name text not null,
    token varchar(64) not null unique,
    abilities text null,
    last_used_at timestamp(0) without time zone null,
    expires_at timestamp(0) without time zone null,
    created_at timestamp(0) without time zone null default current_timestamp,
    updated_at timestamp(0) without time zone null default current_timestamp
);

create index personal_access_tokens_tokenable_type_tokenable_id_index
    on personal_access_tokens(tokenable_type, tokenable_id);
create index personal_access_tokens_expires_at_index
    on personal_access_tokens(expires_at);
create index tokens_tokenable_seen_idx
    on personal_access_tokens(tokenable_type, tokenable_id, last_used_at);

create table incidents (
    id uuid primary key default gen_random_uuid(),
    reference_code varchar(255) null unique,
    client_uuid uuid null unique,
    reporter_id uuid null references users(id) on delete set null,
    is_guest boolean not null default false,
    guest_identifier varchar(64) null,
    type varchar(20) not null
        check (type in ('fire', 'medical', 'crime', 'flood', 'accident', 'other')),
    description text not null,
    incident_datetime timestamp(0) without time zone not null,
    latitude numeric(10, 7) not null,
    longitude numeric(10, 7) not null,
    address_label varchar(255) not null,
    status varchar(30) not null default 'pending_verification'
        check (status in (
            'pending_verification',
            'verified',
            'rejected',
            'under_assessment',
            'responding',
            'resolved'
        )),
    is_iot_generated boolean not null default false,
    device_id varchar(255) null,
    rejection_reason text null,
    resolved_at timestamp(0) without time zone null,
    created_at timestamp(0) without time zone null default current_timestamp,
    updated_at timestamp(0) without time zone null default current_timestamp,
    constraint incidents_guest_reporter_check
        check (
            (is_guest = true and reporter_id is null and guest_identifier is not null)
            or (is_guest = false)
        )
);

create index incidents_type_incident_datetime_index on incidents(type, incident_datetime);
create index incidents_status_created_at_index on incidents(status, created_at);
create index incidents_created_idx on incidents(created_at);
create index incidents_reporter_status_created_idx on incidents(reporter_id, status, created_at);
create index incidents_status_type_created_idx on incidents(status, type, created_at);
create index incidents_iot_status_created_idx on incidents(is_iot_generated, status, created_at);
create index incidents_resolved_idx on incidents(resolved_at);
create index incidents_guest_identifier_created_idx
    on incidents(is_guest, guest_identifier, created_at);

create table guest_report_usages (
    guest_identifier varchar(64) primary key,
    ip_hash varchar(64) null,
    user_agent_hash varchar(64) null,
    reports_count smallint not null default 0,
    first_reported_at timestamp(0) without time zone null,
    last_reported_at timestamp(0) without time zone null,
    created_at timestamp(0) without time zone null default current_timestamp,
    updated_at timestamp(0) without time zone null default current_timestamp
);

create index guest_usage_ip_last_reported_idx
    on guest_report_usages(ip_hash, last_reported_at);
create index guest_usage_count_last_reported_idx
    on guest_report_usages(reports_count, last_reported_at);

create or replace function set_incident_reference_code()
returns trigger as $$
begin
    if new.reference_code is null or new.reference_code = '' then
        new.reference_code := 'RLK-' || upper(replace(new.id::text, '-', ''));
    end if;

    return new;
end;
$$ language plpgsql;

create trigger incidents_reference_code_trigger
before insert on incidents
for each row execute function set_incident_reference_code();

create table incident_media (
    id uuid primary key default gen_random_uuid(),
    incident_id uuid not null references incidents(id) on delete cascade,
    file_path varchar(255) not null,
    file_type varchar(20) not null check (file_type in ('image', 'video')),
    cloudinary_public_id varchar(255) null,
    created_at timestamp(0) without time zone null default current_timestamp,
    updated_at timestamp(0) without time zone null default current_timestamp
);

create table incident_logs (
    id uuid primary key default gen_random_uuid(),
    incident_id uuid not null references incidents(id) on delete cascade,
    changed_by uuid null references users(id) on delete set null,
    old_status varchar(255) null,
    new_status varchar(255) not null,
    notes text null,
    units_coordinated jsonb null,
    created_at timestamp(0) without time zone null default current_timestamp,
    updated_at timestamp(0) without time zone null default current_timestamp
);

create index logs_incident_status_created_idx
    on incident_logs(incident_id, new_status, created_at);
create index logs_status_created_idx on incident_logs(new_status, created_at);
create index logs_changed_created_idx on incident_logs(changed_by, created_at);

create table incident_assignments (
    id uuid primary key default gen_random_uuid(),
    incident_id uuid not null references incidents(id) on delete cascade,
    staff_id uuid not null references users(id) on delete cascade,
    assigned_by uuid null references users(id) on delete set null,
    assigned_at timestamp(0) without time zone null,
    created_at timestamp(0) without time zone null default current_timestamp,
    updated_at timestamp(0) without time zone null default current_timestamp
);

create index incident_assignments_staff_id_created_at_index
    on incident_assignments(staff_id, created_at);
create index assignments_incident_staff_idx
    on incident_assignments(incident_id, staff_id);
create index assignments_incident_created_idx
    on incident_assignments(incident_id, created_at);

create table iot_devices (
    id uuid primary key default gen_random_uuid(),
    device_id varchar(50) not null unique,
    location_name varchar(255) not null,
    latitude numeric(10, 7) not null,
    longitude numeric(10, 7) not null,
    smoke_threshold integer not null default 300,
    api_key varchar(255) not null,
    is_active boolean not null default true,
    last_ping_at timestamp(0) without time zone null,
    created_at timestamp(0) without time zone null default current_timestamp,
    updated_at timestamp(0) without time zone null default current_timestamp
);

create index iot_devices_is_active_created_at_index
    on iot_devices(is_active, created_at);
create index iot_last_ping_idx on iot_devices(last_ping_at);

create table notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid null references users(id) on delete set null,
    title varchar(255) not null,
    message text not null,
    link varchar(255) null,
    is_read boolean not null default false,
    created_at timestamp(0) without time zone not null default current_timestamp
);

create index notifications_user_id_is_read_created_at_index
    on notifications(user_id, is_read, created_at);
create index notifications_read_created_idx on notifications(is_read, created_at);

create table audit_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid null references users(id) on delete set null,
    incident_id uuid null references incidents(id) on delete set null,
    action_type varchar(255) not null,
    entity_type varchar(255) null,
    entity_id varchar(255) null,
    before_state jsonb null,
    after_state jsonb null,
    metadata jsonb null,
    created_at timestamp(0) without time zone null default current_timestamp,
    updated_at timestamp(0) without time zone null default current_timestamp
);

create index audit_logs_action_type_created_at_index
    on audit_logs(action_type, created_at);
create index audit_logs_user_id_created_at_index
    on audit_logs(user_id, created_at);
create index audit_logs_incident_id_created_at_index
    on audit_logs(incident_id, created_at);
create index audit_entity_created_idx
    on audit_logs(entity_type, entity_id, created_at);

insert into migrations (migration, batch) values
('0001_01_01_000000_create_users_table', 1),
('0001_01_01_000001_create_cache_table', 1),
('0001_01_01_000002_create_jobs_table', 1),
('2026_03_06_072030_create_personal_access_tokens_table', 1),
('2026_03_06_081321_create_incidents_table', 1),
('2026_03_06_081322_create_incident_media_table', 1),
('2026_03_06_081323_create_incident_logs_table', 1),
('2026_03_06_084717_create_incident_assignments_table', 1),
('2026_03_06_091441_add_resolved_at_to_incidents_table', 1),
('2026_03_06_111000_create_iot_devices_table', 1),
('2026_03_06_120000_create_notifications_table', 1),
('2026_03_06_190000_add_reference_code_to_incidents_table', 1),
('2026_03_09_150000_create_audit_logs_table', 1),
('2026_03_09_180000_add_role_permissions_to_users_table', 1),
('2026_04_23_000000_add_performance_indexes', 1),
('2026_04_23_020000_add_guest_reporting_support', 1),
('2026_04_25_000000_add_client_uuid_to_incidents_table', 1);

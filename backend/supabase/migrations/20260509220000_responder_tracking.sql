create table if not exists public.responder_locations (
    id uuid primary key default gen_random_uuid(),
    responder_id uuid not null references public.users(id) on delete cascade,
    incident_id uuid null references public.incidents(id) on delete set null,
    action_status varchar(40) not null default 'accepted_request'
        check (action_status in ('accepted_request', 'on_the_way', 'arrived', 'resolved', 'cancelled')),
    latitude numeric(10, 7) not null,
    longitude numeric(10, 7) not null,
    accuracy numeric(8, 2) null,
    heading numeric(6, 2) null,
    battery_level smallint null check (battery_level between 0 and 100),
    metadata jsonb null,
    recorded_at timestamp(0) without time zone not null default now(),
    created_at timestamp(0) without time zone null,
    updated_at timestamp(0) without time zone null,
    constraint responder_locations_responder_unique unique (responder_id)
);

create table if not exists public.responder_status_logs (
    id uuid primary key default gen_random_uuid(),
    responder_id uuid not null references public.users(id) on delete cascade,
    incident_id uuid null references public.incidents(id) on delete set null,
    action_status varchar(40) not null
        check (action_status in ('accepted_request', 'on_the_way', 'arrived', 'resolved', 'cancelled')),
    notes text null,
    latitude numeric(10, 7) null,
    longitude numeric(10, 7) null,
    metadata jsonb null,
    created_at timestamp(0) without time zone null,
    updated_at timestamp(0) without time zone null
);

create index if not exists responder_locations_incident_recorded_idx
    on public.responder_locations (incident_id, recorded_at desc);

create index if not exists responder_locations_action_recorded_idx
    on public.responder_locations (action_status, recorded_at desc);

create index if not exists responder_status_logs_responder_created_idx
    on public.responder_status_logs (responder_id, created_at desc);

create index if not exists responder_status_logs_incident_created_idx
    on public.responder_status_logs (incident_id, created_at desc);

create index if not exists responder_status_logs_action_created_idx
    on public.responder_status_logs (action_status, created_at desc);

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = 'responder_locations'
    ) then
        alter publication supabase_realtime add table public.responder_locations;
    end if;

    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = 'responder_status_logs'
    ) then
        alter publication supabase_realtime add table public.responder_status_logs;
    end if;
end $$;

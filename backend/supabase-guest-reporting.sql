-- RescueLink guest reporting upgrade for an existing Supabase database.
-- Safe to paste into Supabase SQL Editor after the base schema already exists.

alter table public.incidents
    add column if not exists is_guest boolean not null default false;

alter table public.incidents
    add column if not exists guest_identifier varchar(64) null;

create index if not exists incidents_guest_identifier_created_idx
    on public.incidents(is_guest, guest_identifier, created_at);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'incidents_guest_reporter_check'
    ) then
        alter table public.incidents
            add constraint incidents_guest_reporter_check
            check (
                (is_guest = true and reporter_id is null and guest_identifier is not null)
                or (is_guest = false)
            );
    end if;
end $$;

create table if not exists public.guest_report_usages (
    guest_identifier varchar(64) primary key,
    ip_hash varchar(64) null,
    user_agent_hash varchar(64) null,
    reports_count smallint not null default 0,
    first_reported_at timestamp(0) without time zone null,
    last_reported_at timestamp(0) without time zone null,
    created_at timestamp(0) without time zone null default current_timestamp,
    updated_at timestamp(0) without time zone null default current_timestamp
);

create index if not exists guest_usage_ip_last_reported_idx
    on public.guest_report_usages(ip_hash, last_reported_at);

create index if not exists guest_usage_count_last_reported_idx
    on public.guest_report_usages(reports_count, last_reported_at);

insert into public.migrations (migration, batch)
select '2026_04_23_020000_add_guest_reporting_support', 1
where not exists (
    select 1
    from public.migrations
    where migration = '2026_04_23_020000_add_guest_reporting_support'
);

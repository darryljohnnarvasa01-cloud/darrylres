create table if not exists public.hazard_zones (
    id uuid primary key default gen_random_uuid(),
    name varchar(255) not null,
    type varchar(255) not null,
    polygon jsonb not null,
    description text null,
    is_active boolean not null default true,
    created_at timestamp(0) without time zone not null default current_timestamp,
    constraint hazard_zones_type_check check (type in ('danger', 'flood', 'evacuation'))
);

create index if not exists hazard_zones_type_is_active_index
    on public.hazard_zones(type, is_active);

create index if not exists hazard_zones_is_active_created_at_index
    on public.hazard_zones(is_active, created_at);

alter table public.hazard_zones
    add column if not exists capacity integer,
    add column if not exists current_occupancy integer default 0,
    add column if not exists facilities jsonb;

alter table public.users
    add column if not exists is_volunteer boolean not null default false,
    add column if not exists volunteer_skills jsonb null,
    add column if not exists volunteer_availability boolean not null default false;

alter table public.incident_assignments
    add column if not exists is_volunteer boolean not null default false;

create index if not exists users_is_volunteer_index
    on public.users(is_volunteer);

create index if not exists users_volunteer_availability_index
    on public.users(volunteer_availability);

create index if not exists incident_assignments_is_volunteer_index
    on public.incident_assignments(is_volunteer);

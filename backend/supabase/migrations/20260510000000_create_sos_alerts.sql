create table if not exists public.sos_alerts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid null references public.users(id) on delete set null,
    latitude numeric(10, 7) not null,
    longitude numeric(10, 7) not null,
    status varchar(255) not null default 'pending',
    created_at timestamp(0) without time zone not null default current_timestamp,
    resolved_at timestamp(0) without time zone null,
    constraint sos_alerts_status_check check (status in ('pending', 'resolved'))
);

create index if not exists sos_alerts_status_created_at_index
    on public.sos_alerts(status, created_at);

create index if not exists sos_alerts_user_id_created_at_index
    on public.sos_alerts(user_id, created_at);

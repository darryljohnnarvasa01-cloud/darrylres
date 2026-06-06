create table if not exists public.broadcasts (
    id uuid primary key default gen_random_uuid(),
    title varchar(255) not null,
    message text not null,
    link varchar(255) null,
    target_type varchar(255) not null default 'staff',
    target_barangay varchar(255) null,
    target_polygon jsonb null,
    sent_by uuid null references public.users(id) on delete set null,
    created_at timestamp(0) without time zone not null default current_timestamp,
    constraint broadcasts_target_type_check check (target_type in ('staff', 'all', 'barangay', 'polygon'))
);

create index if not exists broadcasts_target_type_created_at_index
    on public.broadcasts(target_type, created_at);

create index if not exists broadcasts_target_barangay_created_at_index
    on public.broadcasts(target_barangay, created_at);

create index if not exists broadcasts_sent_by_created_at_index
    on public.broadcasts(sent_by, created_at);

create table if not exists public.broadcast_recipients (
    broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
    user_id uuid not null references public.users(id) on delete cascade,
    is_read boolean not null default false,
    created_at timestamp(0) without time zone not null default current_timestamp,
    primary key (broadcast_id, user_id)
);

create index if not exists broadcast_recipients_user_id_is_read_created_at_index
    on public.broadcast_recipients(user_id, is_read, created_at);

create table if not exists public.conversations (
    id uuid primary key default gen_random_uuid(),
    incident_id uuid null references public.incidents(id) on delete set null,
    type varchar(20) not null default 'direct',
    created_at timestamp(0) without time zone null default current_timestamp,
    updated_at timestamp(0) without time zone null default current_timestamp,
    constraint conversations_type_check check (type in ('incident', 'direct'))
);

create unique index if not exists conversations_incident_id_type_unique
    on public.conversations(incident_id, type);

create index if not exists conversations_updated_at_index
    on public.conversations(updated_at);

create table if not exists public.conversation_participants (
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    user_id uuid not null references public.users(id) on delete cascade,
    primary key (conversation_id, user_id)
);

create index if not exists conversation_participants_user_id_conversation_id_index
    on public.conversation_participants(user_id, conversation_id);

create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    sender_id uuid not null references public.users(id) on delete cascade,
    recipient_id uuid not null references public.users(id) on delete cascade,
    incident_id uuid null references public.incidents(id) on delete set null,
    body text not null,
    read_at timestamp(0) without time zone null,
    created_at timestamp(0) without time zone not null default current_timestamp
);

create index if not exists messages_conversation_id_created_at_index
    on public.messages(conversation_id, created_at);

create index if not exists messages_recipient_id_read_at_index
    on public.messages(recipient_id, read_at);

create index if not exists messages_incident_id_created_at_index
    on public.messages(incident_id, created_at);

alter table public.notifications
    add column if not exists channel varchar(30) not null default 'in_app';

create index if not exists notifications_user_channel_read_created_idx
    on public.notifications(user_id, channel, is_read, created_at);

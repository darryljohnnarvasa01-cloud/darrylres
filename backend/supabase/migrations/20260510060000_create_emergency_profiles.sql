create table if not exists public.emergency_profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references public.users(id) on delete cascade,
    blood_type varchar(10) null,
    allergies text null,
    medical_conditions text null,
    emergency_contact_name varchar(255) null,
    emergency_contact_phone varchar(30) null,
    is_public boolean not null default true,
    qr_uuid uuid not null unique default gen_random_uuid(),
    created_at timestamp(0) without time zone null default current_timestamp,
    updated_at timestamp(0) without time zone null default current_timestamp
);

create index if not exists emergency_profiles_is_public_updated_at_index
    on public.emergency_profiles(is_public, updated_at);

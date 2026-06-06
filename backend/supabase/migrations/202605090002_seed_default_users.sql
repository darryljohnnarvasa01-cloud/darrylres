-- RescueLink Supabase/Postgres seed data
-- Paste this into the Supabase SQL Editor after creating the schema.
-- This script is safe to rerun; users are updated by email.

set search_path to public;

insert into users (
    id,
    full_name,
    email,
    password,
    phone,
    address,
    barangay,
    role,
    status,
    role_permissions,
    created_at,
    updated_at
) values
(
    '00000000-0000-4000-8000-000000000001',
    'CDRRMO Admin',
    'admin@rescuelink.test',
    '$2y$12$YOBa2KU7bv2fN2xVjGzGiubOq17YP6xh0QHEdhGWtIkfYhzmpllxm',
    '09170000000',
    'CDRRMO Office, Valencia City',
    'Poblacion',
    'admin',
    'verified',
    '{"manage-users":true,"manage-incidents":true,"view-analytics":true,"manage-iot":true,"broadcast-messages":true}'::jsonb,
    current_timestamp,
    current_timestamp
),
(
    '00000000-0000-4000-8000-000000000002',
    'CDRRMO Staff 1',
    'staff1@rescuelink.test',
    '$2y$12$YOBa2KU7bv2fN2xVjGzGiubOq17YP6xh0QHEdhGWtIkfYhzmpllxm',
    '09171111111',
    'Valencia City',
    'Poblacion',
    'staff',
    'verified',
    null,
    current_timestamp,
    current_timestamp
),
(
    '00000000-0000-4000-8000-000000000003',
    'CDRRMO Staff 2',
    'staff2@rescuelink.test',
    '$2y$12$YOBa2KU7bv2fN2xVjGzGiubOq17YP6xh0QHEdhGWtIkfYhzmpllxm',
    '09172222222',
    'Valencia City',
    'Lumbo',
    'staff',
    'verified',
    null,
    current_timestamp,
    current_timestamp
)
on conflict (email) do update set
    full_name = excluded.full_name,
    password = excluded.password,
    phone = excluded.phone,
    address = excluded.address,
    barangay = excluded.barangay,
    role = excluded.role,
    status = excluded.status,
    role_permissions = excluded.role_permissions,
    updated_at = current_timestamp;

-- Default accounts:
-- admin@rescuelink.test / password123
-- staff1@rescuelink.test / password123
-- staff2@rescuelink.test / password123

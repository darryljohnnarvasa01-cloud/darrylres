-- Add email and phone verification fields to users table
-- This is needed for the email verification feature

alter table users 
add column if not exists email_verified_at timestamp(0) without time zone null,
add column if not exists phone_verified_at timestamp(0) without time zone null;

-- Add indexes for performance
create index if not exists users_email_verified_idx on users(email_verified_at);
create index if not exists users_phone_verified_idx on users(phone_verified_at);

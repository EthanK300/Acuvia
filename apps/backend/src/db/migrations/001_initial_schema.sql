-- Schema scaffold for patient session workflow.
-- Run this manually (or with your migration tooling) against Supabase Postgres.

create extension if not exists "pgcrypto";

create table if not exists patients (
  uuid uuid primary key default gen_random_uuid(),
  -- Rank is local within category (1 = most severe inside that category).
  number_rank integer,
  -- ESI triage level:
  -- 1 = Immediate (Resuscitation)
  -- 2 = Emergent (High risk)
  -- 3 = Urgent (Needs multiple resources)
  -- 4 = Less urgent
  -- 5 = Non-urgent
  category integer not null check (category between 1 and 5),
  first_name text not null,
  last_name text not null,
  birthday date not null,
  description text,
  session_start timestamptz not null,
  session_expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists patient_data (
  id bigserial primary key,
  patient_uuid uuid not null references patients(uuid) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists patient_data_patient_uuid_idx on patient_data(patient_uuid);

-- S3 bucket layout scaffold:
-- Bucket name: patient-data
-- Object key format: <patient_uuid>/<unix_timestamp_ms>.<ext>
-- Example: 550e8400-e29b-41d4-a716-446655440000/1714058400000.json

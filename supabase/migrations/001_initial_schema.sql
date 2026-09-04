create extension if not exists pgcrypto;

create type public.app_role as enum ('citizen', 'operator');
create type public.case_status as enum ('REPORTED', 'FINANCIAL_INTERVENTION', 'FUNDS_TRACING', 'PARTIALLY_SECURED', 'INVESTIGATION', 'FIR_REVIEW', 'FIR_REGISTERED', 'RESOLUTION', 'CLOSED');
create type public.movement_status as enum ('secured', 'tracing', 'unrecovered', 'moved', 'withdrawn');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  role public.app_role not null default 'citizen',
  organisation_id uuid,
  team_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.citizens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  full_name text not null,
  phone_masked text,
  city text,
  state text,
  preferred_language text not null default 'en',
  created_at timestamptz not null default now()
);

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution_type text not null,
  short_code text,
  city text,
  state text,
  simulated boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles add constraint profiles_organisation_fk foreign key (organisation_id) references public.institutions(id);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  public_case_id text not null unique check (public_case_id ~ '^NCRP-[0-9]{2}-[0-9]{6}$'),
  citizen_id uuid not null references public.citizens(id),
  case_type text not null,
  case_status public.case_status not null default 'REPORTED',
  priority text not null check (priority in ('urgent', 'high', 'medium', 'low')),
  reported_amount bigint not null check (reported_amount > 0),
  secured_amount bigint not null default 0 check (secured_amount >= 0),
  tracing_amount bigint not null default 0 check (tracing_amount >= 0),
  unrecovered_amount bigint not null default 0 check (unrecovered_amount >= 0),
  current_owner_type text,
  current_owner_name text,
  current_stage text not null,
  version integer not null default 1,
  opened_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_money_reconciles check (reported_amount = secured_amount + tracing_amount + unrecovered_amount)
);

create index cases_citizen_idx on public.cases(citizen_id, created_at desc);
create index cases_queue_idx on public.cases(case_status, priority, last_activity_at desc);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases(id) on delete cascade,
  raw_description text not null check (char_length(raw_description) between 30 and 5000),
  structured_summary text,
  fraud_type text,
  fraud_mechanism text,
  impersonated_entity text,
  payment_channel text,
  incident_at timestamptz,
  first_reported_at timestamptz not null default now(),
  location_text text,
  confidence_score numeric(4,3),
  suspect_identifiers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  parent_transaction_id uuid references public.transactions(id),
  transaction_ref text not null,
  institution_id uuid references public.institutions(id),
  direction text,
  amount bigint not null check (amount > 0),
  transaction_type text,
  transaction_status text,
  occurred_at timestamptz,
  destination_identifier_masked text,
  source_identifier_masked text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(case_id, transaction_ref)
);

create table public.fund_movements (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  source_transaction_id uuid references public.transactions(id),
  destination_transaction_id uuid references public.transactions(id),
  amount bigint not null check (amount > 0),
  movement_status public.movement_status not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  uploaded_by_user_id uuid not null references public.profiles(id),
  evidence_type text not null,
  title text not null,
  storage_bucket text not null default 'case-evidence',
  storage_key text not null unique,
  original_filename text not null,
  content_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 8388608),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  extracted_metadata_json jsonb not null default '{}'::jsonb,
  retention_until timestamptz,
  legal_hold boolean not null default false,
  deleted_at timestamptz,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.evidence_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  requested_by uuid references public.profiles(id),
  title text not null,
  description text not null,
  required_evidence_type text not null,
  due_at timestamptz,
  status text not null check (status in ('open', 'submitted', 'accepted', 'cancelled')),
  submitted_evidence_id uuid references public.evidence(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.agency_assignments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  institution_id uuid not null references public.institutions(id),
  assigned_operator_id uuid references public.profiles(id),
  team_name text,
  assignment_type text not null,
  status text not null,
  assigned_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.fir_records (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases(id) on delete cascade,
  fir_status text not null,
  fir_number text,
  police_station text,
  registered_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  event_type text not null,
  actor_type text not null,
  actor_id uuid references public.profiles(id),
  institution_id uuid references public.institutions(id),
  payload_json jsonb not null default '{}'::jsonb,
  previous_state_json jsonb not null default '{}'::jsonb,
  new_state_json jsonb not null default '{}'::jsonb,
  citizen_visible boolean not null default true,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index case_events_case_time_idx on public.case_events(case_id, occurred_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  delivery_status text not null default 'in_app',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles(id),
  action text not null,
  resource_type text not null,
  resource_id uuid not null,
  metadata_json jsonb not null default '{}'::jsonb,
  previous_hash text,
  entry_hash text not null,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  safe_name text;
begin
  safe_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Citizen');
  insert into public.profiles(id, display_name, role) values (new.id, safe_name, 'citizen');
  insert into public.citizens(user_id, full_name) values (new.id, safe_name);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles for each row execute procedure public.touch_updated_at();
create trigger cases_touch before update on public.cases for each row execute procedure public.touch_updated_at();
create trigger incidents_touch before update on public.incidents for each row execute procedure public.touch_updated_at();
create trigger fir_touch before update on public.fir_records for each row execute procedure public.touch_updated_at();

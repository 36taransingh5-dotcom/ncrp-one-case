create type public.integration_job_status as enum ('pending', 'processing', 'retrying', 'succeeded', 'failed');

create table public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  provider text not null,
  action text not null,
  payload_json jsonb not null default '{}'::jsonb,
  status public.integration_job_status not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  idempotency_key text not null unique,
  external_reference text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  completed_at timestamptz,
  locked_at timestamptz,
  locked_by text
);

create index integration_jobs_ready_idx on public.integration_jobs(status, next_attempt_at) where status in ('pending', 'retrying');
alter table public.integration_jobs enable row level security;
grant select on public.integration_jobs to authenticated;
create policy integration_jobs_operator_select on public.integration_jobs for select to authenticated using (public.is_operator());

create or replace function public.claim_integration_jobs(worker_name text, batch_size integer default 10)
returns setof public.integration_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.integration_jobs j
  set status = 'processing', locked_at = now(), locked_by = worker_name, attempt_count = attempt_count + 1, updated_at = now()
  where j.id in (
    select id from public.integration_jobs
    where status in ('pending', 'retrying') and next_attempt_at <= now()
    order by created_at
    for update skip locked
    limit greatest(1, least(batch_size, 50))
  )
  returning j.*;
end;
$$;
revoke all on function public.claim_integration_jobs(text, integer) from public, anon, authenticated;

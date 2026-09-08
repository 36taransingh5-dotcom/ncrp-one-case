-- Durable receipts for inbound partner callbacks, plus automatic job
-- enqueue for case creation and beneficiary identification so HTTP adapters
-- can run without replacing the large command dispatcher.
create table public.integration_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null unique,
  event_type text not null,
  case_id uuid not null references public.cases(id) on delete cascade,
  job_id uuid references public.integration_jobs(id) on delete set null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index integration_webhook_receipts_case_idx
  on public.integration_webhook_receipts(case_id, created_at desc);

alter table public.integration_webhook_receipts enable row level security;
grant select on public.integration_webhook_receipts to authenticated;
create policy webhook_receipts_operator_select
  on public.integration_webhook_receipts
  for select to authenticated
  using (public.is_operator());

create or replace function public.enqueue_integration_jobs_for_case_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type = 'CASE_CREATED' then
    insert into public.integration_jobs(case_id, provider, action, payload_json, idempotency_key)
    values (
      new.case_id,
      'reporting',
      'create_external_complaint',
      jsonb_build_object('source_event_id', new.id),
      'reporting:complaint:' || new.case_id::text
    )
    on conflict (idempotency_key) do nothing;
  elsif new.event_type = 'BENEFICIARY_BANK_IDENTIFIED' then
    insert into public.integration_jobs(case_id, provider, action, payload_json, idempotency_key)
    values (
      new.case_id,
      'bank',
      'identify_beneficiary',
      jsonb_build_object('source_event_id', new.id),
      'bank:identify:' || new.case_id::text
    )
    on conflict (idempotency_key) do nothing;
    insert into public.integration_jobs(case_id, provider, action, payload_json, idempotency_key)
    values (
      new.case_id,
      'bank',
      'notify_fraud',
      jsonb_build_object('source_event_id', new.id),
      'bank:notify:' || new.case_id::text
    )
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists case_event_integration_jobs on public.case_events;
create trigger case_event_integration_jobs
  after insert on public.case_events
  for each row execute procedure public.enqueue_integration_jobs_for_case_event();

-- Durable email delivery metadata written by the outbox worker.
-- Optional extra job fields are stored in payload_json so hosted deploys
-- keep working before this migration is applied.
create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_event_id uuid unique references public.outbox_events(id) on delete set null,
  case_id uuid not null references public.cases(id) on delete cascade,
  provider text not null,
  message_id text,
  recipient text not null,
  template text not null,
  status text not null,
  attempt_count integer not null default 0,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_deliveries_case_idx
  on public.email_deliveries(case_id, created_at desc);

alter table public.email_deliveries enable row level security;
grant select on public.email_deliveries to authenticated;
create policy email_deliveries_operator_select
  on public.email_deliveries
  for select to authenticated
  using (public.is_operator());

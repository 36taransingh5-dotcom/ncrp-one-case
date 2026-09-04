create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'published', 'failed')),
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outbox_ready_idx on public.outbox_events(status, available_at) where status in ('pending', 'failed');
alter table public.outbox_events enable row level security;
revoke all on public.outbox_events from anon, authenticated;

alter table public.case_events replica identity full;
alter publication supabase_realtime add table public.case_events;
alter publication supabase_realtime add table public.notifications;

create or replace function public.enqueue_outbox_for_case_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.outbox_events(aggregate_type, aggregate_id, event_type, payload_json, idempotency_key)
  values ('case', new.case_id, new.event_type, jsonb_build_object('case_id', new.case_id, 'event_id', new.id), 'case-event:' || new.id::text)
  on conflict (idempotency_key) do nothing;
  return new;
end;
$$;

create trigger case_event_outbox after insert on public.case_events for each row execute procedure public.enqueue_outbox_for_case_event();

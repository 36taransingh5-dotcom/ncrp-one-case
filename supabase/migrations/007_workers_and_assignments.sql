alter table public.agency_assignments
  add constraint agency_assignments_active_unique
  unique (case_id, institution_id, assignment_type);

create or replace function public.claim_outbox_events(worker_name text, batch_size integer default 25)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.outbox_events event
  set status = 'processing',
      attempt_count = attempt_count + 1,
      updated_at = now()
  where event.id in (
    select id
    from public.outbox_events
    where status in ('pending', 'failed') and available_at <= now()
    order by created_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  returning event.*;
end;
$$;

revoke all on function public.claim_outbox_events(text, integer) from public, anon, authenticated;
grant execute on function public.claim_outbox_events(text, integer) to service_role;

create or replace function public.recover_stale_work()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.integration_jobs
  set status = 'retrying',
      locked_at = null,
      locked_by = null,
      next_attempt_at = now(),
      last_error = 'Worker lease expired; recovered automatically.',
      updated_at = now()
  where status = 'processing' and locked_at < now() - interval '10 minutes';

  update public.outbox_events
  set status = 'failed',
      available_at = now(),
      last_error = 'Worker lease expired; recovered automatically.',
      updated_at = now()
  where status = 'processing' and updated_at < now() - interval '10 minutes';
end;
$$;

revoke all on function public.recover_stale_work() from public, anon, authenticated;
grant execute on function public.recover_stale_work() to service_role;

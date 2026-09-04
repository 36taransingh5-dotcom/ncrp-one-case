create table public.api_rate_limits (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  request_count integer not null default 1,
  primary key(actor_id, bucket, window_start)
);

alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_window timestamptz;
  v_count integer;
begin
  if v_actor is null then return false; end if;
  if p_limit < 1 or p_window_seconds < 1 or char_length(p_bucket) > 80 then
    raise exception 'INVALID_RATE_LIMIT';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.api_rate_limits(actor_id,bucket,window_start,request_count)
  values(v_actor,p_bucket,v_window,1)
  on conflict(actor_id,bucket,window_start)
  do update set request_count=public.api_rate_limits.request_count+1
  returning request_count into v_count;
  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;

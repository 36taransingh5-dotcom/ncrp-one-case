create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'operator');
$$;

create or replace function public.owns_case(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.cases k
    join public.citizens c on c.id = k.citizen_id
    where k.id = target_case_id and c.user_id = auth.uid()
  );
$$;

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.institutions to authenticated;
grant select on public.profiles, public.citizens, public.cases, public.incidents, public.transactions, public.fund_movements, public.evidence, public.evidence_requests, public.agency_assignments, public.fir_records, public.case_events, public.notifications, public.audit_logs to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant update(read_at) on public.notifications to authenticated;

alter table public.profiles enable row level security;
alter table public.citizens enable row level security;
alter table public.institutions enable row level security;
alter table public.cases enable row level security;
alter table public.incidents enable row level security;
alter table public.transactions enable row level security;
alter table public.fund_movements enable row level security;
alter table public.evidence enable row level security;
alter table public.evidence_requests enable row level security;
alter table public.agency_assignments enable row level security;
alter table public.fir_records enable row level security;
alter table public.case_events enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_operator());
create policy profiles_update_name on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy citizens_select on public.citizens for select to authenticated using (user_id = auth.uid() or public.is_operator());
create policy institutions_select on public.institutions for select to authenticated using (true);
create policy cases_select on public.cases for select to authenticated using (public.owns_case(id) or public.is_operator());
create policy cases_insert on public.cases for insert to authenticated with check (exists(select 1 from public.citizens c where c.id = citizen_id and c.user_id = auth.uid()));
create policy incidents_select on public.incidents for select to authenticated using (public.owns_case(case_id) or public.is_operator());
create policy incidents_insert on public.incidents for insert to authenticated with check (public.owns_case(case_id));
create policy transactions_select on public.transactions for select to authenticated using (public.owns_case(case_id) or public.is_operator());
create policy transactions_insert on public.transactions for insert to authenticated with check (public.owns_case(case_id));
create policy movements_select on public.fund_movements for select to authenticated using (public.owns_case(case_id) or public.is_operator());
create policy movements_insert on public.fund_movements for insert to authenticated with check (public.owns_case(case_id));
create policy evidence_select on public.evidence for select to authenticated using ((public.owns_case(case_id) and deleted_at is null) or public.is_operator());
create policy evidence_insert on public.evidence for insert to authenticated with check (uploaded_by_user_id = auth.uid() and public.owns_case(case_id));
create policy evidence_requests_select on public.evidence_requests for select to authenticated using (public.owns_case(case_id) or public.is_operator());
create policy assignments_select on public.agency_assignments for select to authenticated using (public.owns_case(case_id) or public.is_operator());
create policy fir_select on public.fir_records for select to authenticated using (public.owns_case(case_id) or public.is_operator());
create policy events_select on public.case_events for select to authenticated using ((public.owns_case(case_id) and citizen_visible) or public.is_operator());
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid() or public.is_operator());
create policy notifications_update_read on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy audits_operator_select on public.audit_logs for select to authenticated using (public.is_operator());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('case-evidence', 'case-evidence', false, 8388608, array['application/pdf','image/png','image/jpeg','text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy evidence_objects_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'case-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.owns_case(((storage.foldername(name))[2])::uuid)
);
create policy evidence_objects_select on storage.objects for select to authenticated
using (
  bucket_id = 'case-evidence'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_operator())
);

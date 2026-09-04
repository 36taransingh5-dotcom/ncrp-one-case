create or replace function public.record_evidence_upload(
  p_case_id uuid,
  p_title text,
  p_evidence_type text,
  p_storage_key text,
  p_original_filename text,
  p_content_type text,
  p_file_size bigint,
  p_sha256 text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evidence_id uuid := gen_random_uuid();
  v_request_id uuid;
begin
  if not public.owns_case(p_case_id) then raise exception 'CASE_NOT_FOUND'; end if;
  if p_file_size <= 0 or p_file_size > 8388608 or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_EVIDENCE'; end if;
  if p_content_type not in ('application/pdf','image/png','image/jpeg','text/plain') then raise exception 'INVALID_CONTENT_TYPE'; end if;
  if p_storage_key not like auth.uid()::text || '/' || p_case_id::text || '/%' then raise exception 'INVALID_STORAGE_KEY'; end if;
  if not exists(select 1 from storage.objects where bucket_id='case-evidence' and name=p_storage_key) then raise exception 'STORAGE_OBJECT_REQUIRED'; end if;
  insert into public.evidence(id,case_id,uploaded_by_user_id,evidence_type,title,storage_key,original_filename,content_type,file_size,sha256,retention_until)
  values(v_evidence_id,p_case_id,auth.uid(),p_evidence_type,p_title,p_storage_key,p_original_filename,p_content_type,p_file_size,p_sha256,now()+interval '7 years');
  select id into v_request_id from public.evidence_requests where case_id=p_case_id and status='open' order by created_at limit 1 for update;
  if v_request_id is not null then
    update public.evidence_requests set status='submitted',submitted_evidence_id=v_evidence_id where id=v_request_id;
  end if;
  insert into public.case_events(case_id,event_type,actor_type,actor_id,payload_json,previous_state_json,new_state_json)
  values(p_case_id,'EVIDENCE_UPLOADED','citizen',auth.uid(),jsonb_build_object('label','Evidence received','evidence_id',v_evidence_id,'sha256',p_sha256),'{}'::jsonb,jsonb_build_object('evidence_request_status',case when v_request_id is null then null else 'submitted' end));
  return v_evidence_id;
end;
$$;
revoke all on function public.record_evidence_upload(uuid,text,text,text,text,text,bigint,text) from public, anon;
grant execute on function public.record_evidence_upload(uuid,text,text,text,text,text,bigint,text) to authenticated;

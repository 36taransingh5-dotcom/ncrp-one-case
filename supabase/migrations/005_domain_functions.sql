create table public.domain_command_receipts (
  idempotency_key text primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null,
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.domain_command_receipts enable row level security;
revoke all on public.domain_command_receipts from anon, authenticated;

create or replace function public.create_case(
  p_description text,
  p_amount bigint,
  p_fraud_type text,
  p_payment_channel text,
  p_incident_at timestamptz,
  p_transaction_reference text default null,
  p_institution_details text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case_id uuid := gen_random_uuid();
  v_citizen_id uuid;
  v_public_id text;
  v_transaction_id uuid := gen_random_uuid();
begin
  if char_length(p_description) < 30 or p_amount <= 0 then
    raise exception 'INVALID_INTAKE';
  end if;
  select id into v_citizen_id from public.citizens where user_id = auth.uid();
  if v_citizen_id is null then raise exception 'CITIZEN_PROFILE_REQUIRED'; end if;
  if exists(select 1 from public.profiles where id = auth.uid() and role <> 'citizen') then
    raise exception 'CITIZEN_ROLE_REQUIRED';
  end if;
  loop
    v_public_id := 'NCRP-' || to_char(now(), 'YY') || '-' || lpad((floor(random() * 900000) + 100000)::bigint::text, 6, '0');
    exit when not exists(select 1 from public.cases where public_case_id = v_public_id);
  end loop;

  insert into public.cases(id, public_case_id, citizen_id, case_type, priority, reported_amount, tracing_amount, current_owner_type, current_owner_name, current_stage)
  values(v_case_id, v_public_id, v_citizen_id, 'Financial cyber fraud', 'high', p_amount, p_amount, 'government', 'NCRP One Case intake', 'REPORTED');
  insert into public.incidents(case_id, raw_description, structured_summary, fraud_type, fraud_mechanism, impersonated_entity, payment_channel, incident_at, location_text)
  values(v_case_id, p_description, 'Citizen-reported financial cyber fraud awaiting operator review.', p_fraud_type, p_fraud_type, p_institution_details, p_payment_channel, p_incident_at, null);
  insert into public.transactions(id, case_id, transaction_ref, direction, amount, transaction_type, transaction_status, occurred_at, destination_identifier_masked, source_identifier_masked)
  values(v_transaction_id, v_case_id, coalesce(nullif(p_transaction_reference, ''), 'REPORTED-' || right(v_public_id, 6)), 'outbound', p_amount, p_payment_channel, 'reported', p_incident_at, p_institution_details, 'Citizen account (masked)');
  insert into public.fund_movements(case_id, source_transaction_id, amount, movement_status, occurred_at)
  values(v_case_id, v_transaction_id, p_amount, 'tracing', p_incident_at);
  insert into public.case_events(case_id, event_type, actor_type, actor_id, payload_json, previous_state_json, new_state_json)
  values(v_case_id, 'CASE_CREATED', 'citizen', auth.uid(), jsonb_build_object('label', 'Complaint received', 'amount', p_amount), '{}'::jsonb, jsonb_build_object('case_status', 'REPORTED'));
  insert into public.notifications(user_id, case_id, notification_type, title, body)
  values(auth.uid(), v_case_id, 'case_created', 'Case ' || v_public_id || ' created', 'Your case has been created and is ready for financial intervention. External systems remain simulated in this prototype.');
  return v_public_id;
end;
$$;
grant execute on function public.create_case(text, bigint, text, text, timestamptz, text, text) to authenticated;

create or replace function public.execute_case_command(
  p_public_case_id text,
  p_action text,
  p_expected_version integer,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases%rowtype;
  v_movement public.fund_movements%rowtype;
  v_event_type text;
  v_label text;
  v_previous_hash text;
  v_audit_hash text;
  v_result jsonb;
  v_institution uuid;
  v_audit_time timestamptz;
begin
  if not public.is_operator() then raise exception 'OPERATOR_REQUIRED'; end if;
  select result_json into v_result from public.domain_command_receipts where idempotency_key = p_idempotency_key;
  if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
  select * into v_case from public.cases where public_case_id = p_public_case_id for update;
  if v_case.id is null then raise exception 'CASE_NOT_FOUND'; end if;
  if v_case.version <> p_expected_version then raise exception 'CASE_CHANGED'; end if;

  case p_action
    when 'IDENTIFY_BENEFICIARY_BANK' then
      if v_case.case_status <> 'REPORTED' then raise exception 'INVALID_TRANSITION'; end if;
      v_event_type := 'BENEFICIARY_BANK_IDENTIFIED'; v_label := 'Beneficiary bank identified';
      update public.cases set case_status='FINANCIAL_INTERVENTION', current_stage='FINANCIAL INTERVENTION', current_owner_type='bank', current_owner_name='HDFC Bank — fraud response team (simulated)' where id=v_case.id;
    when 'SEND_FREEZE_REQUEST' then
      if not exists(select 1 from public.case_events where case_id=v_case.id and event_type='BENEFICIARY_BANK_IDENTIFIED') then raise exception 'BENEFICIARY_REQUIRED'; end if;
      if exists(select 1 from public.case_events where case_id=v_case.id and event_type='FREEZE_REQUEST_CREATED') then raise exception 'FREEZE_ALREADY_REQUESTED'; end if;
      v_event_type := 'FREEZE_REQUEST_CREATED'; v_label := 'Freeze request queued for the beneficiary bank';
      insert into public.integration_jobs(case_id, provider, action, payload_json, idempotency_key)
      values(v_case.id, 'bank', 'request_freeze', p_payload, p_idempotency_key || ':job') on conflict(idempotency_key) do nothing;
    when 'SECURE_ADDITIONAL_FUNDS' then
      if coalesce((p_payload->>'amount')::bigint,0) <= 0 then raise exception 'INVALID_AMOUNT'; end if;
      select * into v_movement from public.fund_movements where case_id=v_case.id and movement_status in ('tracing','moved') and amount=(p_payload->>'amount')::bigint order by occurred_at for update skip locked limit 1;
      if v_movement.id is null then raise exception 'NO_MATCHING_MOVEMENT'; end if;
      update public.fund_movements set movement_status='secured', occurred_at=now() where id=v_movement.id;
      update public.cases set case_status='PARTIALLY_SECURED',current_stage='FUNDS PARTIALLY SECURED',current_owner_type='government',current_owner_name='Financial intervention coordination desk' where id=v_case.id;
      v_event_type := 'FUNDS_SECURED'; v_label := '₹' || to_char(v_movement.amount, 'FM99,99,99,990') || ' secured in a beneficiary account';
    when 'MARK_FUNDS_MOVED' then
      select * into v_movement from public.fund_movements where case_id=v_case.id and movement_status='tracing' order by occurred_at for update skip locked limit 1;
      if v_movement.id is null then raise exception 'NO_TRACEABLE_MOVEMENT'; end if;
      update public.fund_movements set movement_status='moved', occurred_at=now() where id=v_movement.id;
      v_event_type := 'FUNDS_MOVED'; v_label := 'Funds moved to a secondary account';
    when 'MARK_FUNDS_WITHDRAWN' then
      select * into v_movement from public.fund_movements where case_id=v_case.id and movement_status in ('tracing','moved') order by occurred_at for update skip locked limit 1;
      if v_movement.id is null then raise exception 'NO_TRACEABLE_MOVEMENT'; end if;
      update public.fund_movements set movement_status='unrecovered', occurred_at=now() where id=v_movement.id;
      v_event_type := 'FUNDS_WITHDRAWN'; v_label := 'Funds marked unrecovered after withdrawal';
    when 'ASSIGN_CYBER_CELL' then
      if exists(select 1 from public.case_events where case_id=v_case.id and event_type='CYBER_CELL_ASSIGNED') then raise exception 'CYBER_CELL_ALREADY_ASSIGNED'; end if;
      select id into v_institution from public.institutions where short_code='BLR-CCU' limit 1;
      insert into public.agency_assignments(case_id,institution_id,assigned_operator_id,team_name,assignment_type,status,acknowledged_at)
      values(v_case.id,v_institution,auth.uid(),'Financial cyber fraud','investigation','acknowledged',now()) on conflict do nothing;
      update public.cases set current_owner_type='government',current_owner_name='Bengaluru Cyber Crime Unit (simulated)' where id=v_case.id;
      insert into public.integration_jobs(case_id,provider,action,payload_json,idempotency_key)
      values(v_case.id,'police','assign_cyber_cell',p_payload,p_idempotency_key || ':job') on conflict(idempotency_key) do nothing;
      v_event_type := 'CYBER_CELL_ASSIGNED'; v_label := 'Cyber Crime Unit assigned';
    when 'START_INVESTIGATION' then
      if v_case.case_status <> 'PARTIALLY_SECURED' then raise exception 'INVALID_TRANSITION'; end if;
      update public.cases set case_status='INVESTIGATION',current_stage='INVESTIGATION' where id=v_case.id;
      v_event_type := 'INVESTIGATION_STARTED'; v_label := 'Investigation started';
    when 'REQUEST_EVIDENCE' then
      if char_length(coalesce(p_payload->>'title','')) < 3 or char_length(coalesce(p_payload->>'description','')) < 10 then raise exception 'INVALID_EVIDENCE_REQUEST'; end if;
      if exists(select 1 from public.evidence_requests where case_id=v_case.id and status='open') then raise exception 'EVIDENCE_ALREADY_REQUESTED'; end if;
      insert into public.evidence_requests(case_id,requested_by,title,description,required_evidence_type,due_at,status)
      values(v_case.id,auth.uid(),p_payload->>'title',p_payload->>'description','financial',now()+interval '48 hours','open');
      v_event_type := 'EVIDENCE_REQUESTED'; v_label := coalesce(p_payload->>'title','Evidence requested');
    when 'ACCEPT_EVIDENCE' then
      update public.evidence_requests set status='accepted',resolved_at=now() where id=(select id from public.evidence_requests where case_id=v_case.id and status='submitted' order by created_at limit 1);
      if not found then raise exception 'NO_SUBMITTED_EVIDENCE'; end if;
      v_event_type := 'EVIDENCE_ACCEPTED'; v_label := 'Submitted evidence accepted';
    when 'START_FIR_REVIEW' then
      if exists(select 1 from public.fir_records where case_id=v_case.id and fir_status in ('under_review','registered')) then raise exception 'FIR_REVIEW_ALREADY_STARTED'; end if;
      insert into public.fir_records(case_id,fir_status,police_station,reason) values(v_case.id,'under_review','Bengaluru Cyber Crime Police Station (simulated)','Review in progress')
      on conflict(case_id) do update set fir_status='under_review',reason='Review in progress',updated_at=now();
      update public.cases set case_status='FIR_REVIEW',current_stage='FIR REVIEW' where id=v_case.id;
      insert into public.integration_jobs(case_id,provider,action,payload_json,idempotency_key)
      values(v_case.id,'police','start_fir_review',p_payload,p_idempotency_key || ':job') on conflict(idempotency_key) do nothing;
      v_event_type := 'FIR_REVIEW_STARTED'; v_label := 'FIR review started';
    when 'REGISTER_FIR' then
      update public.fir_records set fir_status='registered',fir_number='SIM-FIR-' || right(v_case.public_case_id,6) || '/' || extract(year from now())::text,registered_at=now(),updated_at=now() where case_id=v_case.id and fir_status='under_review';
      if not found then raise exception 'FIR_REVIEW_REQUIRED'; end if;
      update public.cases set case_status='FIR_REGISTERED',current_stage='FIR REGISTERED' where id=v_case.id;
      insert into public.integration_jobs(case_id,provider,action,payload_json,idempotency_key)
      values(v_case.id,'police','register_fir',p_payload,p_idempotency_key || ':job') on conflict(idempotency_key) do nothing;
      v_event_type := 'FIR_REGISTERED'; v_label := 'FIR registered in simulation';
    when 'ESCALATE_CASE' then
      if exists(select 1 from public.case_events where case_id=v_case.id and event_type='CASE_ESCALATED') then raise exception 'CASE_ALREADY_ESCALATED'; end if;
      update public.cases set current_owner_name='Cyber Crime Unit — escalation desk' where id=v_case.id;
      v_event_type := 'CASE_ESCALATED'; v_label := 'Case escalated';
    when 'RESOLVE_CASE' then
      if exists(select 1 from public.fund_movements where case_id=v_case.id and movement_status in ('tracing','moved')) then raise exception 'FUNDS_STILL_TRACING'; end if;
      update public.cases set case_status='RESOLUTION',current_stage='RESOLUTION' where id=v_case.id;
      v_event_type := 'CASE_RESOLVED'; v_label := 'Case moved to resolution';
    when 'CLOSE_CASE' then
      if v_case.case_status <> 'RESOLUTION' then raise exception 'RESOLUTION_REQUIRED'; end if;
      update public.cases set case_status='CLOSED',current_stage='CLOSED',closed_at=now() where id=v_case.id;
      v_event_type := 'CASE_CLOSED'; v_label := 'Case closed';
    else raise exception 'UNKNOWN_COMMAND';
  end case;

  update public.cases k set
    secured_amount=(select coalesce(sum(amount),0) from public.fund_movements where case_id=k.id and movement_status='secured'),
    tracing_amount=(select coalesce(sum(amount),0) from public.fund_movements where case_id=k.id and movement_status in ('tracing','moved')),
    unrecovered_amount=(select coalesce(sum(amount),0) from public.fund_movements where case_id=k.id and movement_status in ('unrecovered','withdrawn')),
    version=version+1,last_activity_at=now()
  where id=v_case.id;
  insert into public.case_events(case_id,event_type,actor_type,actor_id,payload_json,previous_state_json,new_state_json)
  values(v_case.id,v_event_type,'operator',auth.uid(),p_payload || jsonb_build_object('label',v_label,'simulated',true),jsonb_build_object('version',v_case.version),jsonb_build_object('version',v_case.version+1));
  insert into public.notifications(user_id,case_id,notification_type,title,body)
  select c.user_id,v_case.id,lower(v_event_type),v_label,'A new update has been recorded in your case.' from public.citizens c where c.id=v_case.citizen_id;
  select entry_hash into v_previous_hash from public.audit_logs where resource_id=v_case.id order by created_at desc limit 1;
  v_audit_time := now();
  v_audit_hash := encode(extensions.digest(coalesce(v_previous_hash,'') || p_action || auth.uid()::text || v_case.id::text || v_audit_time::text || p_payload::text || p_idempotency_key,'sha256'),'hex');
  insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata_json,previous_hash,entry_hash,created_at)
  values(auth.uid(),p_action,'case',v_case.id,p_payload,v_previous_hash,v_audit_hash,v_audit_time);
  v_result := jsonb_build_object('case_id',v_case.id,'public_case_id',v_case.public_case_id,'version',v_case.version+1,'event_type',v_event_type);
  insert into public.domain_command_receipts(idempotency_key,case_id,actor_id,action,result_json)
  values(p_idempotency_key,v_case.id,auth.uid(),p_action,v_result);
  return v_result;
end;
$$;
revoke all on function public.execute_case_command(text,text,integer,text,jsonb) from public, anon;
grant execute on function public.execute_case_command(text,text,integer,text,jsonb) to authenticated;

grant execute on function public.claim_integration_jobs(text, integer) to service_role;

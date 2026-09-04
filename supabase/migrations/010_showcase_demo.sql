create or replace function public.seed_showcase_demo(
  p_citizen_user_id uuid,
  p_operator_user_id uuid,
  p_evidence_key text,
  p_evidence_sha256 text,
  p_evidence_size bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_citizen_id uuid;
  v_case_id uuid := '21000000-0000-0000-0000-000000000001';
  v_evidence_id uuid := '51000000-0000-0000-0000-000000000001';
  v_sbi uuid := '10000000-0000-0000-0000-000000000001';
  v_hdfc uuid := '10000000-0000-0000-0000-000000000002';
  v_icici uuid := '10000000-0000-0000-0000-000000000003';
  v_ccu uuid := '10000000-0000-0000-0000-000000000004';
  v_police uuid := '10000000-0000-0000-0000-000000000005';
  v_hash_one text;
  v_hash_two text;
begin
  if not exists(select 1 from public.profiles where id=p_citizen_user_id and role='citizen')
     or not exists(select 1 from public.profiles where id=p_operator_user_id and role='operator') then
    raise exception 'SHOWCASE_IDENTITIES_NOT_PROVISIONED';
  end if;
  if p_evidence_key not like p_citizen_user_id::text || '/' || v_case_id::text || '/%'
     or p_evidence_sha256 !~ '^[a-f0-9]{64}$'
     or p_evidence_size <= 0 then
    raise exception 'INVALID_SHOWCASE_EVIDENCE';
  end if;

  insert into public.institutions(id,name,institution_type,short_code,city,state,simulated)
  values
    (v_sbi,'State Bank of India (simulated)','bank','SBI',null,null,true),
    (v_hdfc,'HDFC Bank (simulated)','bank','HDFC',null,null,true),
    (v_icici,'ICICI Bank (simulated)','bank','ICICI',null,null,true),
    (v_ccu,'Bengaluru Cyber Crime Unit (simulated)','cyber_cell','BLR-CCU','Bengaluru','Karnataka',true),
    (v_police,'Bengaluru Cyber Crime Police Station (simulated)','police','BLR-CCPS','Bengaluru','Karnataka',true)
  on conflict(id) do update set name=excluded.name, institution_type=excluded.institution_type,
    short_code=excluded.short_code, city=excluded.city, state=excluded.state, simulated=true;

  select id into v_citizen_id from public.citizens where user_id=p_citizen_user_id;
  delete from public.cases where public_case_id='NCRP-26-926184';

  insert into public.cases(
    id,public_case_id,citizen_id,case_type,case_status,priority,
    reported_amount,secured_amount,tracing_amount,unrecovered_amount,
    current_owner_type,current_owner_name,current_stage,version,opened_at,last_activity_at
  ) values(
    v_case_id,'NCRP-26-926184',v_citizen_id,'Financial cyber fraud','FIR_REGISTERED','urgent',
    86750,62400,18750,5600,
    'police','Bengaluru Cyber Crime Police Station (simulated)','FIR REGISTERED',12,
    now()-interval '12 hours',now()-interval '30 minutes'
  );

  insert into public.incidents(
    case_id,raw_description,structured_summary,fraud_type,fraud_mechanism,
    impersonated_entity,payment_channel,incident_at,location_text,confidence_score,
    suspect_identifiers
  ) values(
    v_case_id,
    'Synthetic citizen report: a caller claiming to be from the electricity department sent a payment link and persuaded the citizen to approve a UPI collect request for ₹86,750.',
    'A synthetic electricity-bill impersonation led to an unauthorised UPI collect payment. The receiving account and onward fund movements were identified for simulated intervention.',
    'UPI collect-request impersonation','Urgency scam using a malicious UPI collect request',
    'Electricity department (simulated)','UPI',now()-interval '13 hours','Bengaluru, Karnataka',0.94,
    jsonb_build_object('phone','+91 ••••• 48192','upi','supportdesk@simulated')
  );

  insert into public.transactions(
    id,case_id,transaction_ref,institution_id,direction,amount,transaction_type,
    transaction_status,occurred_at,source_identifier_masked,destination_identifier_masked
  ) values
    ('31000000-0000-0000-0000-000000000001',v_case_id,'SIM-UPI-86750',v_sbi,'outbound',86750,'upi_collect','reported',now()-interval '13 hours','SBI ••2048','simulated@upi'),
    ('31000000-0000-0000-0000-000000000002',v_case_id,'SIM-HOLD-62400',v_hdfc,'inbound',62400,'beneficiary_hold','secured',now()-interval '9 hours 40 minutes','HDFC ••7319','HDFC secured hold'),
    ('31000000-0000-0000-0000-000000000003',v_case_id,'SIM-TRACE-18750',v_icici,'inbound',18750,'secondary_transfer','tracing',now()-interval '8 hours','HDFC ••7319','ICICI ••1186'),
    ('31000000-0000-0000-0000-000000000004',v_case_id,'SIM-CASH-5600',null,'outbound',5600,'cash_withdrawal','unrecovered',now()-interval '7 hours','HDFC ••7319','Cash withdrawal (simulated)');

  insert into public.fund_movements(
    id,case_id,source_transaction_id,destination_transaction_id,amount,movement_status,occurred_at
  ) values
    ('41000000-0000-0000-0000-000000000001',v_case_id,'31000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000002',62400,'secured',now()-interval '9 hours 40 minutes'),
    ('41000000-0000-0000-0000-000000000002',v_case_id,'31000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000003',18750,'tracing',now()-interval '8 hours'),
    ('41000000-0000-0000-0000-000000000003',v_case_id,'31000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000004',5600,'unrecovered',now()-interval '7 hours');

  insert into public.agency_assignments(
    case_id,institution_id,assigned_operator_id,team_name,assignment_type,status,assigned_at,acknowledged_at
  ) values
    (v_case_id,v_ccu,p_operator_user_id,'Financial cyber fraud','investigation','acknowledged',now()-interval '7 hours 30 minutes',now()-interval '7 hours 20 minutes'),
    (v_case_id,v_police,p_operator_user_id,'FIR desk','fir_registration','active',now()-interval '2 hours 30 minutes',now()-interval '2 hours 20 minutes');

  insert into public.evidence(
    id,case_id,uploaded_by_user_id,evidence_type,title,storage_bucket,storage_key,
    original_filename,content_type,file_size,sha256,extracted_metadata_json,
    retention_until,legal_hold,uploaded_at
  ) values(
    v_evidence_id,v_case_id,p_citizen_user_id,'financial','Bank statement — synthetic sample',
    'case-evidence',p_evidence_key,'synthetic-bank-statement.txt','text/plain',p_evidence_size,
    p_evidence_sha256,jsonb_build_object('synthetic',true,'transaction_reference','SIM-UPI-86750'),
    now()+interval '7 years',true,now()-interval '4 hours'
  );

  insert into public.evidence_requests(
    id,case_id,requested_by,title,description,required_evidence_type,due_at,status,
    submitted_evidence_id,created_at,resolved_at
  ) values
    ('61000000-0000-0000-0000-000000000001',v_case_id,p_operator_user_id,
      'Bank statement for the disputed payment','Upload the statement page showing synthetic transaction SIM-UPI-86750.',
      'financial',now()+interval '36 hours','accepted',v_evidence_id,now()-interval '5 hours',now()-interval '3 hours 40 minutes'),
    ('61000000-0000-0000-0000-000000000002',v_case_id,p_operator_user_id,
      'Screenshot of the fraudulent message','Upload the SMS or chat screenshot that contained the simulated payment link.',
      'communication',now()+interval '48 hours','open',null,now()-interval '30 minutes',null);

  insert into public.fir_records(
    case_id,fir_status,fir_number,police_station,registered_at,reason
  ) values(
    v_case_id,'registered','SIM-FIR-926184/2026','Bengaluru Cyber Crime Police Station (simulated)',
    now()-interval '1 hour','Registered in the simulated police adapter for the mentor showcase.'
  );

  insert into public.case_events(
    case_id,event_type,actor_type,actor_id,institution_id,payload_json,
    previous_state_json,new_state_json,occurred_at
  ) values
    (v_case_id,'CASE_CREATED','citizen',p_citizen_user_id,null,jsonb_build_object('label','Complaint received','amount',86750,'synthetic',true),'{}',jsonb_build_object('case_status','REPORTED'),now()-interval '12 hours'),
    (v_case_id,'INCIDENT_CLASSIFIED','system',null,null,jsonb_build_object('label','Report understood as UPI impersonation fraud','synthetic',true),'{}',jsonb_build_object('confidence',0.94),now()-interval '11 hours 55 minutes'),
    (v_case_id,'TRANSACTION_IDENTIFIED','system',null,v_sbi,jsonb_build_object('label','₹86,750 UPI transaction identified','synthetic',true),'{}',jsonb_build_object('transaction_ref','SIM-UPI-86750'),now()-interval '11 hours 45 minutes'),
    (v_case_id,'SENDER_BANK_NOTIFIED','system',null,v_sbi,jsonb_build_object('label','Your bank notified (simulated)','synthetic',true),'{}','{}',now()-interval '11 hours 30 minutes'),
    (v_case_id,'BENEFICIARY_BANK_IDENTIFIED','operator',p_operator_user_id,v_hdfc,jsonb_build_object('label','Beneficiary bank identified','synthetic',true),'{}',jsonb_build_object('case_status','FINANCIAL_INTERVENTION'),now()-interval '10 hours 30 minutes'),
    (v_case_id,'FREEZE_REQUEST_CREATED','operator',p_operator_user_id,v_hdfc,jsonb_build_object('label','Freeze request sent to beneficiary bank (simulated)','synthetic',true),jsonb_build_object('secured_amount',0),jsonb_build_object('case_status','FINANCIAL_INTERVENTION'),now()-interval '10 hours'),
    (v_case_id,'FUNDS_PARTIALLY_SECURED','system',null,v_hdfc,jsonb_build_object('label','₹62,400 secured in the beneficiary account','synthetic',true),jsonb_build_object('secured_amount',0),jsonb_build_object('secured_amount',62400),now()-interval '9 hours 40 minutes'),
    (v_case_id,'FUNDS_MOVED','system',null,v_icici,jsonb_build_object('label','₹18,750 traced to a second account','synthetic',true),'{}',jsonb_build_object('tracing_amount',18750),now()-interval '8 hours'),
    (v_case_id,'FUNDS_WITHDRAWN','system',null,null,jsonb_build_object('label','₹5,600 withdrawn before the hold arrived','synthetic',true),'{}',jsonb_build_object('unrecovered_amount',5600),now()-interval '7 hours'),
    (v_case_id,'CYBER_CELL_ASSIGNED','operator',p_operator_user_id,v_ccu,jsonb_build_object('label','Bengaluru Cyber Crime Unit assigned (simulated)','synthetic',true),'{}',jsonb_build_object('owner','BLR-CCU'),now()-interval '7 hours 30 minutes'),
    (v_case_id,'INVESTIGATION_STARTED','operator',p_operator_user_id,v_ccu,jsonb_build_object('label','Investigation started','synthetic',true),'{}',jsonb_build_object('case_status','INVESTIGATION'),now()-interval '7 hours'),
    (v_case_id,'EVIDENCE_REQUESTED','operator',p_operator_user_id,null,jsonb_build_object('label','Bank statement requested','synthetic',true),'{}',jsonb_build_object('evidence_request_status','open'),now()-interval '5 hours'),
    (v_case_id,'EVIDENCE_UPLOADED','citizen',p_citizen_user_id,null,jsonb_build_object('label','Bank statement received and SHA-256 fingerprinted','sha256',p_evidence_sha256,'synthetic',true),'{}',jsonb_build_object('evidence_request_status','submitted'),now()-interval '4 hours'),
    (v_case_id,'EVIDENCE_ACCEPTED','operator',p_operator_user_id,null,jsonb_build_object('label','Bank statement checked and accepted','synthetic',true),jsonb_build_object('evidence_request_status','submitted'),jsonb_build_object('evidence_request_status','accepted'),now()-interval '3 hours 40 minutes'),
    (v_case_id,'FIR_REVIEW_STARTED','operator',p_operator_user_id,v_police,jsonb_build_object('label','FIR review started (simulated)','synthetic',true),'{}',jsonb_build_object('case_status','FIR_REVIEW'),now()-interval '2 hours'),
    (v_case_id,'FIR_REGISTERED','operator',p_operator_user_id,v_police,jsonb_build_object('label','FIR SIM-FIR-926184/2026 registered (simulated)','synthetic',true),jsonb_build_object('case_status','FIR_REVIEW'),jsonb_build_object('case_status','FIR_REGISTERED'),now()-interval '1 hour'),
    (v_case_id,'EVIDENCE_REQUESTED','operator',p_operator_user_id,null,jsonb_build_object('label','Screenshot of the fraudulent message requested','synthetic',true),'{}',jsonb_build_object('evidence_request_status','open'),now()-interval '30 minutes');

  insert into public.notifications(
    user_id,case_id,notification_type,title,body,created_at
  ) values
    (p_citizen_user_id,v_case_id,'funds_partially_secured','₹62,400 secured','The simulated beneficiary bank confirmed that ₹62,400 is held and cannot be moved.',now()-interval '9 hours 40 minutes'),
    (p_citizen_user_id,v_case_id,'evidence_accepted','Bank statement accepted','Your synthetic bank statement passed its integrity check and was accepted.',now()-interval '3 hours 40 minutes'),
    (p_citizen_user_id,v_case_id,'fir_registered','FIR registered','Simulated FIR SIM-FIR-926184/2026 has been registered against this case.',now()-interval '1 hour'),
    (p_citizen_user_id,v_case_id,'evidence_requested','One document needed','Please upload the synthetic message screenshot within 48 hours.',now()-interval '30 minutes');

  v_hash_one := encode(extensions.digest('showcase-identify-bank-' || v_case_id::text,'sha256'),'hex');
  v_hash_two := encode(extensions.digest(v_hash_one || '-showcase-secure-funds-' || v_case_id::text,'sha256'),'hex');
  insert into public.audit_logs(
    actor_user_id,action,resource_type,resource_id,metadata_json,previous_hash,entry_hash,created_at
  ) values
    (p_operator_user_id,'IDENTIFY_BENEFICIARY_BANK','case',v_case_id,jsonb_build_object('synthetic',true),null,v_hash_one,now()-interval '10 hours 30 minutes'),
    (p_operator_user_id,'SECURE_ADDITIONAL_FUNDS','case',v_case_id,jsonb_build_object('amount',62400,'synthetic',true),v_hash_one,v_hash_two,now()-interval '9 hours 40 minutes');

  return 'NCRP-26-926184';
end;
$$;

revoke all on function public.seed_showcase_demo(uuid,uuid,text,text,bigint) from public, anon, authenticated;
grant execute on function public.seed_showcase_demo(uuid,uuid,text,text,bigint) to service_role;

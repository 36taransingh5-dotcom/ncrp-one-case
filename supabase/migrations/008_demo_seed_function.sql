create or replace function public.seed_round2_demo(
  p_citizen_user_id uuid,
  p_operator_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_citizen_id uuid;
  v_case_id uuid := '20000000-0000-0000-0000-000000000001';
  v_sbi uuid := '10000000-0000-0000-0000-000000000001';
  v_hdfc uuid := '10000000-0000-0000-0000-000000000002';
  v_icici uuid := '10000000-0000-0000-0000-000000000003';
  v_ccu uuid := '10000000-0000-0000-0000-000000000004';
begin
  if not exists(select 1 from public.profiles where id=p_citizen_user_id and role='citizen')
     or not exists(select 1 from public.profiles where id=p_operator_user_id and role='operator') then
    raise exception 'DEMO_IDENTITIES_NOT_PROVISIONED';
  end if;

  select id into v_citizen_id from public.citizens where user_id=p_citizen_user_id;
  delete from public.cases where public_case_id='NCRP-26-847193';

  insert into public.cases(id,public_case_id,citizen_id,case_type,case_status,priority,reported_amount,secured_amount,tracing_amount,unrecovered_amount,current_owner_type,current_owner_name,current_stage,version,opened_at,last_activity_at)
  values(v_case_id,'NCRP-26-847193',v_citizen_id,'Financial cyber fraud','PARTIALLY_SECURED','urgent',48500,31200,12000,5300,'bank','HDFC Bank — fraud response team (simulated)','FUNDS PARTIALLY SECURED',1,now()-interval '5 hours',now()-interval '15 minutes');

  insert into public.incidents(case_id,raw_description,structured_summary,fraud_type,fraud_mechanism,impersonated_entity,payment_channel,incident_at,confidence_score)
  values(v_case_id,'Synthetic citizen report: a caller impersonated SBI, requested installation of an APK and induced an unauthorised transfer.','Reported SBI impersonation involving a malicious application and an unauthorised bank transfer.','Bank impersonation / phishing','Bank impersonation + malicious APK','SBI (simulated report)','Bank transfer',now()-interval '6 hours',0.82);

  insert into public.transactions(id,case_id,transaction_ref,institution_id,direction,amount,transaction_type,transaction_status,occurred_at,source_identifier_masked,destination_identifier_masked)
  values
    ('30000000-0000-0000-0000-000000000001',v_case_id,'SIM-TXN-48500',v_sbi,'outbound',48500,'bank_transfer','reported',now()-interval '6 hours','SBI ••4102','HDFC ••9281'),
    ('30000000-0000-0000-0000-000000000002',v_case_id,'SIM-HOLD-31200',v_hdfc,'inbound',31200,'beneficiary_hold','secured',now()-interval '3 hours','HDFC ••9281','HDFC hold'),
    ('30000000-0000-0000-0000-000000000003',v_case_id,'SIM-MOVE-6700',v_icici,'inbound',6700,'secondary_transfer','tracing',now()-interval '2 hours','HDFC ••9281','ICICI ••6734'),
    ('30000000-0000-0000-0000-000000000004',v_case_id,'SIM-TRACE-5300',v_hdfc,'inbound',5300,'beneficiary_balance','tracing',now()-interval '2 hours','HDFC ••9281','HDFC ••2177'),
    ('30000000-0000-0000-0000-000000000005',v_case_id,'SIM-CASH-5300',null,'outbound',5300,'cash_withdrawal','unrecovered',now()-interval '90 minutes','HDFC ••9281','Cash withdrawal (simulated)');

  insert into public.fund_movements(id,case_id,source_transaction_id,destination_transaction_id,amount,movement_status,occurred_at)
  values
    ('40000000-0000-0000-0000-000000000001',v_case_id,'30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',31200,'secured',now()-interval '3 hours'),
    ('40000000-0000-0000-0000-000000000002',v_case_id,'30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003',6700,'tracing',now()-interval '2 hours'),
    ('40000000-0000-0000-0000-000000000003',v_case_id,'30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004',5300,'tracing',now()-interval '2 hours'),
    ('40000000-0000-0000-0000-000000000004',v_case_id,'30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000005',5300,'unrecovered',now()-interval '90 minutes');

  insert into public.agency_assignments(case_id,institution_id,assigned_operator_id,team_name,assignment_type,status,acknowledged_at)
  values(v_case_id,v_ccu,p_operator_user_id,'Financial cyber fraud','investigation','acknowledged',now()-interval '2 hours');
  insert into public.fir_records(case_id,fir_status,police_station,reason)
  values(v_case_id,'under_review','Bengaluru Cyber Crime Police Station (simulated)','Synthetic FIR review in progress');
  insert into public.evidence_requests(case_id,requested_by,title,description,required_evidence_type,due_at,status)
  values(v_case_id,p_operator_user_id,'Updated bank statement needed','Upload a bank statement covering the latest 48-hour period.','financial',now()+interval '42 hours','open');
  insert into public.case_events(case_id,event_type,actor_type,actor_id,payload_json,previous_state_json,new_state_json,occurred_at)
  values
    (v_case_id,'CASE_CREATED','citizen',p_citizen_user_id,jsonb_build_object('label','Complaint received','amount',48500,'synthetic',true),'{}',jsonb_build_object('case_status','REPORTED'),now()-interval '5 hours'),
    (v_case_id,'FREEZE_REQUEST_CREATED','operator',p_operator_user_id,jsonb_build_object('label','Freeze request sent to beneficiary bank (simulated)','simulated',true),jsonb_build_object('case_status','REPORTED'),jsonb_build_object('case_status','FINANCIAL_INTERVENTION'),now()-interval '3 hours 30 minutes'),
    (v_case_id,'FUNDS_PARTIALLY_SECURED','system',null,jsonb_build_object('label','₹31,200 secured; remaining funds are being traced','simulated',true),jsonb_build_object('secured_amount',0),jsonb_build_object('secured_amount',31200),now()-interval '3 hours');
  insert into public.notifications(user_id,case_id,notification_type,title,body)
  values(p_citizen_user_id,v_case_id,'funds_partially_secured','₹31,200 secured','The beneficiary bank simulation reports that part of the synthetic transaction is secured.');
  return 'NCRP-26-847193';
end;
$$;

revoke all on function public.seed_round2_demo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.seed_round2_demo(uuid, uuid) to service_role;

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(id,email,aud,role)
values
  ('a0000000-0000-0000-0000-000000000001','citizen-a@example.test','authenticated','authenticated'),
  ('b0000000-0000-0000-0000-000000000002','citizen-b@example.test','authenticated','authenticated'),
  ('c0000000-0000-0000-0000-000000000003','operator@example.test','authenticated','authenticated');
update public.profiles set role='operator' where id='c0000000-0000-0000-0000-000000000003';

insert into public.cases(id,public_case_id,citizen_id,case_type,priority,reported_amount,tracing_amount,current_stage)
select 'd0000000-0000-0000-0000-000000000001','NCRP-26-100001',id,'Financial cyber fraud','high',1000,1000,'REPORTED'
from public.citizens where user_id='a0000000-0000-0000-0000-000000000001';
insert into public.cases(id,public_case_id,citizen_id,case_type,priority,reported_amount,tracing_amount,current_stage)
select 'd0000000-0000-0000-0000-000000000002','NCRP-26-100002',id,'Financial cyber fraud','high',2000,2000,'REPORTED'
from public.citizens where user_id='b0000000-0000-0000-0000-000000000002';
insert into public.fund_movements(case_id,amount,movement_status)
values
  ('d0000000-0000-0000-0000-000000000001',1000,'tracing'),
  ('d0000000-0000-0000-0000-000000000002',2000,'tracing');
insert into public.evidence(case_id,uploaded_by_user_id,evidence_type,title,storage_key,original_filename,content_type,file_size,sha256)
values
  ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','financial','A','a/case/a.txt','a.txt','text/plain',1,repeat('a',64)),
  ('d0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002','financial','B','b/case/b.txt','b.txt','text/plain',1,repeat('b',64));

set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select results_eq('select public_case_id from public.cases order by public_case_id',array['NCRP-26-100001'],'Citizen A sees only their case');
select is((select count(*)::integer from public.evidence),1,'Citizen A sees only their evidence');
select is(public.is_operator(),false,'Citizen A is not an operator');
select throws_ok($$update public.profiles set role='operator' where id=auth.uid()$$,'42501',null,'Citizen cannot update role');
select throws_ok($$select public.execute_case_command('NCRP-26-100001','ESCALATE_CASE',1,'rls-test','{}')$$,'P0001','OPERATOR_REQUIRED','Citizen cannot execute operator command');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select is((select count(*)::integer from public.cases),2,'Operator sees authorized operations cases');
select is((select count(*)::integer from public.audit_logs),0,'Audit history remains operator-readable');
select is((public.execute_case_command('NCRP-26-100001','ESCALATE_CASE',1,'00000000-0000-0000-0000-000000000001','{}')->>'event_type'),'CASE_ESCALATED','Operator command is persisted');
select is((public.execute_case_command('NCRP-26-100001','ESCALATE_CASE',1,'00000000-0000-0000-0000-000000000001','{}')->>'replayed'),'true','Identical retry returns its receipt');
select is((select count(*)::integer from public.audit_logs where resource_id='d0000000-0000-0000-0000-000000000001'),1,'Identical retry does not duplicate the audit entry');
select * from finish();
rollback;

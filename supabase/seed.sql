insert into public.institutions(id, name, institution_type, short_code, city, state, simulated)
values
  ('10000000-0000-0000-0000-000000000001', 'State Bank of India (simulated)', 'bank', 'SBI', null, null, true),
  ('10000000-0000-0000-0000-000000000002', 'HDFC Bank (simulated)', 'bank', 'HDFC', null, null, true),
  ('10000000-0000-0000-0000-000000000003', 'ICICI Bank (simulated)', 'bank', 'ICICI', null, null, true),
  ('10000000-0000-0000-0000-000000000004', 'Bengaluru Cyber Crime Unit (simulated)', 'cyber_cell', 'BLR-CCU', 'Bengaluru', 'Karnataka', true),
  ('10000000-0000-0000-0000-000000000005', 'Bengaluru Cyber Crime Police Station (simulated)', 'police', 'BLR-CCPS', 'Bengaluru', 'Karnataka', true)
on conflict (id) do update set name = excluded.name, institution_type = excluded.institution_type, simulated = true;

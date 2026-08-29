# Integration boundaries

Everything inside this application boundary is implemented: sessions and roles, persistence, derived totals, domain events, audit logs, SSE updates, evidence storage and hashing. No real complaint is filed and no real funds are frozen.

`lib/adapters/contracts.ts` exposes replaceable `BankAdapter`, `PoliceAdapter` and `FraudReportingAdapter` contracts. `lib/adapters/simulated.ts` implements deterministic adapters invoked by fund-security, assignment and FIR commands in this prototype. Production bindings would use authenticated, approved government/banking APIs, idempotency keys, encrypted transport, retry queues and provider-specific reconciliation while retaining the case-engine interface.

Identity, telecom, Aadhaar/DigiLocker, NCRP/1930/CFCFRMS, police/FIR, bank/UPI and inter-agency systems are all simulated. The UI labels them as simulated and never implies official affiliation or a real external action.

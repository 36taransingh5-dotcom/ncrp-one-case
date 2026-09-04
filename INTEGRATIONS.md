# Integration boundaries

No real NCRP/1930/CFCFRMS, police/FIR, bank/UPI, telecom, Aadhaar/DigiLocker or inter-agency system is connected. All external identities, references and responses are synthetic or simulated and the UI states this independently of the demo content.

`lib/adapters/contracts.ts` owns the replaceable bank, police and fraud-reporting interfaces; `lib/adapters/simulated.ts` is the deterministic development implementation. Application state never depends on an adapter's in-memory state. Commands persist a job first, and `lib/jobs/process.ts` later invokes the adapter and records its result.

| Boundary                        | Current adapter                 | Durable behavior                                | Production replacement               |
| ------------------------------- | ------------------------------- | ----------------------------------------------- | ------------------------------------ |
| NCRP / 1930 / CFCFRMS           | Simulated reporting             | External reference in job result                | Approved authenticated complaint API |
| Bank / UPI                      | Simulated bank                  | Freeze job, idempotency key, retries, reference | Approved participant-bank gateway    |
| Police / FIR                    | Simulated police                | Assignment/review/registration jobs             | State police integration             |
| Evidence malware scan           | Interface-ready validation hook | MIME/signature/hash retained                    | Approved asynchronous scanner        |
| Notifications                   | Persistent in-app notifications | Atomic record + outbox event                    | Transactional email adapter          |
| Telecom / identity / DigiLocker | Not connected                   | Explicitly out of scope                         | Future approved adapters only        |

Provider implementations must preserve idempotency keys, classify retryable/permanent errors, enforce timeouts, return external reference IDs and support reconciliation. They must never log evidence bytes, complaint narratives, session tokens or unmasked personal/financial data.

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

# OpenAI case intelligence

Set server-only `OPENAI_API_KEY` and `OPENAI_MODEL` (default `gpt-4.1-mini`). The official SDK uses Responses structured outputs, strict Zod validation, a 25-second timeout, no automatic retries and `store: false`. Only the complaint or selected case fields are sent; profiles, credentials, signed URLs and audit hashes are excluded. Complaint text is untrusted input and the model has no tools or domain-command access.

Citizens explicitly accept suggestions into editable fields and confirm the ordinary intake form. Operators request a concise brief and execute existing actions separately. AI results are advisory and currently held in page state; reload or case-version changes discard them. Persistent analysis history, cross-request caching and evidence analysis remain P1. Errors never block manual reporting or operator actions. Both endpoints require the appropriate role and limit requests to six per ten minutes per user.

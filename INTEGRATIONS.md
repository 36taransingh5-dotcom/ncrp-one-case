# Integration boundaries

No official NCRP/1930/CFCFRMS, police/FIR, bank/UPI, telecom, Aadhaar/DigiLocker or inter-agency production system is connected. All people, institutions, identifiers and amounts in this prototype remain synthetic. HTTP mode talks to **configured partner or sandbox endpoints**, not live government or bank cores.

`lib/adapters/contracts.ts` owns the replaceable bank, police, reporting and notification interfaces. `lib/adapters/simulated.ts` is the in-process development implementation. `lib/adapters/http.ts` is the authenticated HTTP implementation. `lib/adapters/index.ts` binds each provider at runtime. Application state never depends on an adapter's in-memory state. Commands persist a job first, and `lib/jobs/process.ts` later invokes the adapter and records its result.

| Boundary              | Current adapter                     | Durable behavior                                      | Production replacement               |
| --------------------- | ----------------------------------- | ----------------------------------------------------- | ------------------------------------ |
| NCRP / 1930 / CFCFRMS | Simulated or HTTP `/v1/complaints`  | Case-created job, external reference, retries         | Approved authenticated complaint API |
| Bank / UPI            | Simulated or HTTP freeze/lookup     | Freeze job, idempotency key, status poll, webhook ack | Approved participant-bank gateway    |
| Police / FIR          | Simulated or HTTP assignment/FIR    | Assignment/review/registration jobs                   | State police integration             |
| Evidence malware scan | Interface-ready validation hook     | MIME/signature/hash retained                          | Approved asynchronous scanner        |
| Notifications         | Resend, HTTP sandbox, or simulated  | Outbox send, retries, delivery receipts               | Transactional email (Resend)         |
| DigiLocker            | Disabled until requester onboarding | Pluggable adapter, no fake locker                     | Approved requester API               |
| API Setu              | Disabled until client credentials   | Status page + env placeholders                        | Approved government API              |

Set `NCRP_INTEGRATION_MODE=http` plus per-provider base URL and API key (or `NCRP_SANDBOX_SECRET` with `NCRP_APP_BASE_URL`) to send real HTTP. Hosted `NCRP_BACKEND=supabase` deployments also enable the HTTP sandbox automatically when `NCRP_WORKER_SECRET` is set, unless `NCRP_INTEGRATION_MODE=simulated`. Missing provider credentials keep that provider on the simulated adapter. Local tests and the SQLite demo stay `simulated`.

Reporting and beneficiary-bank jobs are enqueued from the application after `CASE_CREATED` and `BENEFICIARY_BANK_IDENTIFIED`, using the same idempotency keys as migration `012_http_integrations.sql`. Hosted deploys therefore queue those jobs even before that migration is applied. The SQL trigger remains the durable database path. Inbound webhooks fall back to `case_events` dedupe if `integration_webhook_receipts` does not exist yet.

The in-app sandbox at `/api/integrations/sandbox/{bank,police,reporting,notification}/v1/...` is a labelled synthetic partner. It requires the provider API key or sandbox secret in production. It returns deterministic references from the `Idempotency-Key` header and never talks to a real bank or police system.

Inbound callbacks POST to `/api/integrations/webhook` with `X-NCRP-Signature: sha256=<hex>` over the raw body using `NCRP_WEBHOOK_SECRET`. Optional `X-NCRP-Timestamp` or `occurredAt` must fall within a ten-minute window. Duplicate `eventId` values replay as HTTP 200. Callbacks append case events; they do not mutate fund totals or register an FIR by themselves.

Provider implementations must preserve idempotency keys, classify retryable/permanent errors, enforce timeouts, return external reference IDs and support reconciliation. They must never log evidence bytes, complaint narratives, session tokens or unmasked personal/financial data. `GET /api/health` reports the resolved adapter binding per provider without URLs or secrets. Operators can inspect `/integrations` for LIVE / SANDBOX / SIMULATED / NOT CONNECTED / DEGRADED labels.

# Transactional email

Set `RESEND_API_KEY` and `RESEND_FROM` (and optionally `NCRP_NOTIFICATION_MODE=resend`). The outbox worker sends mail only for evidence requested, funds secured, freeze acknowledgement, cyber-cell assignment, FIR registered and case resolved. Templates never include amounts or account numbers. Email failure retries on the outbox and never rolls back the case command. Delivery rows are stored in `email_deliveries` when migration `013` has been applied.

# DigiLocker and API Setu

No requester or API Setu credentials are configured in this repository. The adapters stay disabled, the citizen DigiLocker control is unavailable, and `/integrations` shows NOT CONNECTED with “Requires DigiLocker requester onboarding”. Do not invent a sandbox locker or government API.

# OpenAI case intelligence

Set server-only `OPENAI_API_KEY` and `OPENAI_MODEL` (default `gpt-4.1-mini`). The official SDK uses Responses structured outputs, strict Zod validation, a 25-second timeout, no automatic retries and `store: false`. Only the complaint or selected case fields are sent; profiles, credentials, signed URLs and audit hashes are excluded. Complaint text is untrusted input and the model has no tools or domain-command access.

Citizens explicitly accept suggestions into editable fields and confirm the ordinary intake form. Operators request a concise brief and execute existing actions separately. AI results are advisory and currently held in page state; reload or case-version changes discard them. Persistent analysis history, cross-request caching and evidence analysis remain P1. Errors never block manual reporting or operator actions. Both endpoints require the appropriate role and limit requests to six per ten minutes per user.

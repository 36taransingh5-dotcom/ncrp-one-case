# NCRP One Case

[![CI](https://github.com/36taransingh5-dotcom/ncrp-one-case/actions/workflows/ci.yml/badge.svg)](https://github.com/36taransingh5-dotcom/ncrp-one-case/actions/workflows/ci.yml)

**Report once. Government coordinates the rest.** NCRP One Case is an independent hackathon prototype of a national cyber-fraud case coordination platform. It is not an official government service. Every person, institution, identifier, transaction and external government/bank action shown is synthetic or simulated.

## Round 2 capabilities

- Stateless Next.js 16 application with Supabase Postgres as production persistence; SQLite remains an explicit local demo adapter only.
- Supabase email OTP/magic-link accounts, server-verified sessions and database-managed citizen/operator roles.
- PostgreSQL RLS for citizen-owned cases, evidence, events and notifications; citizens cannot self-assign operator access.
- Arbitrary case intake, persistent citizen case list, prioritized operations queue and assignment-based **My Queue**.
- Transactional domain commands with optimistic concurrency, idempotency receipts, case events, citizen notifications and tamper-evident audit chaining.
- Private Supabase Storage evidence with short-lived signed downloads, 8 MiB/type/magic-byte validation, SHA-256, retention metadata and non-overwriting object keys.
- Supabase Realtime updates sourced from committed `case_events`, plus a durable outbox and database-backed integration jobs with leases, retries and stale-work recovery.
- Replaceable simulated NCRP/reporting, bank/UPI and police/FIR adapters. No real external action is performed.
- Repeatable local and Supabase seeds for `NCRP-26-847193`, including the operator action that moves ₹6,700 from tracing to secured.
- Node tests, SQL RLS tests, full two-session Playwright E2E, format/type/build checks and GitHub Actions CI.

## Local product demo

Requires Node 24+.

```bash
npm install
npm run seed
npm run dev
```

With no Supabase variables configured, development uses the explicit local adapter and displays one-click synthetic citizen/operator entry. Open `http://localhost:3000`.

```bash
npm run format:check
npm run typecheck
npm test
npm run test:e2e
npm run build
```

## Production-shaped Supabase setup

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NCRP_BACKEND=supabase`, the URL, publishable key, secret key and worker secret.
3. Link the CLI and apply migrations: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
4. Configure the Auth site URL and add `<app-url>/auth/callback` as an allowed redirect URL.
5. Create an operator Auth user, then run `npm run provision-operator -- operator@example.org` with admin environment variables available.
6. Optionally set the four synthetic demo identity variables in `.env.example` and run `npm run seed:supabase`.
   Set `NCRP_DEMO_ACCESS_ENABLED=true` only for a clearly labelled judging deployment that should expose one-click access to those two synthetic accounts. Their passwords remain server-only.
7. Run the worker route on a recurring schedule with `Authorization: Bearer $NCRP_WORKER_SECRET`.

Verify a fresh deployment with `GET /api/health`; production should return `{ "status": "ok", "backend": "supabase" }`.

Run the full two-browser golden path against a deployment with:

```bash
E2E_BASE_URL=https://your-app.example npm run test:e2e
```

The service secret is server-only. A production instance never sets `NCRP_BACKEND=local`; when set to `supabase`, any attempted SQLite access fails closed.

See [ARCHITECTURE.md](ARCHITECTURE.md), [DEMO.md](DEMO.md), [SEEDING.md](SEEDING.md), and [INTEGRATIONS.md](INTEGRATIONS.md).

# AI case intelligence

## Expanded citizen intake

The report form collects a 200–3,000 character narrative, incident location, bank/wallet/merchant and transaction date, optional suspect name/contact/account/address/URL/handle, synthetic identity type, and evidence notes. Additional fields are validated server-side and appended as labelled citizen-supplied information to the existing incident record within the case-creation transaction (not separate normalized suspect entities). Both citizen and operator views expose the submitted record. Combined narrative length is capped at 5,000 characters.

Citizens can select one synthetic JPG/PNG identity document and up to four supporting PDF/JPG/PNG/text files before confirmation, limited to 4 MB each in this form. Files upload through the existing private, SHA-256-checked evidence endpoint after the case is created. If an upload fails, the review screen retains the created case reference and retries only pending uploads; citizens can also open the created case and upload later. Selected files are held in page memory, not durable drafts. Reloading loses unsubmitted selections. Identity collection is optional, synthetic-only, and not identity verification. The form is informed by the public NCRP checklist, not certified as an official filing interface. AI analysis remains description-only; attachments are not sent to AI.

Citizen intake includes **Analyse report** and explicit acceptance into editable fields. Operations includes an advisory **AI Case Brief** with known/inferred/missing information and a constrained next-action suggestion. Core reporting and domain commands work independently of AI availability.

Configure `OPENAI_API_KEY` as a server-only Vercel Production secret and `OPENAI_MODEL` (default `gpt-4.1-mini`), then redeploy. Never use a `NEXT_PUBLIC_` key. Until a valid key is configured, the analysis controls display a recoverable unavailable message. Live model quality must be verified with the synthetic scenario in the AI brief before claiming a completed AI demo. Evidence analysis and persistent analysis history remain P1.

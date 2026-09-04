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
7. Run the worker route on a recurring schedule with `Authorization: Bearer $NCRP_WORKER_SECRET`.

Verify a fresh deployment with `GET /api/health`; production should return `{ "status": "ok", "backend": "supabase" }`.

The service secret is server-only. A production instance never sets `NCRP_BACKEND=local`; when set to `supabase`, any attempted SQLite access fails closed.

See [ARCHITECTURE.md](ARCHITECTURE.md), [DEMO.md](DEMO.md), [SEEDING.md](SEEDING.md), and [INTEGRATIONS.md](INTEGRATIONS.md).

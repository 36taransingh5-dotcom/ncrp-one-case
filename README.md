# NCRP One Case

[![CI](https://github.com/36taransingh5-dotcom/ncrp-one-case/actions/workflows/ci.yml/badge.svg)](https://github.com/36taransingh5-dotcom/ncrp-one-case/actions/workflows/ci.yml)

**Report once. Government coordinates the rest.** NCRP One Case is an independent hackathon prototype of a unified cyber-fraud case coordination experience. It is not an official government service. All people, institutions, transactions, identifiers and downstream actions are synthetic or simulated.

## What works

- Signed, HTTP-only demo sessions with citizen and operator roles.
- Persistent SQLite entities for cases, incidents, funds, evidence, requests, assignments, FIR records, events, notifications and audit logs.
- Event-derived citizen timeline and money totals that reconcile to the reported loss.
- Deterministic seeded case `NCRP-26-847193` and three additional queue cases.
- Operator-triggered simulated additional ₹6,700 hold, with transaction-state validation, event, audit record, notification and server-sent-event update.
- Citizen evidence upload with persisted metadata and SHA-256 fingerprint.
- Bounded investigation, evidence, FIR, escalation, resolution and closure actions with invalid-transition protection.
- Data-driven fund trail, citizen notification inbox and internal operator audit history.
- Persisted timestamp-based SLA evaluation with automatic breach and escalation events.
- Authenticated evidence retrieval, downloadable synthetic case summaries and security headers.

## Run locally

Requires Node 24+ (the vertical slice uses its built-in SQLite driver).

```bash
cp .env.example .env.local
npm install
npm run seed
npm run dev
```

Open `http://localhost:3000`. Select **Enter citizen demo** or **Operations demo**; no password is required for the seeded, signed demo session. The demo accounts are `citizen@demo.onecase.in` and `operator@demo.onecase.in`.

Run `npm run reset-demo` to restore the golden demo state. Use `npm test`, `npm run typecheck` and `npm run build` before deployment.

## Deployment

Set `NCRP_DATABASE_PATH` and `NCRP_UPLOAD_DIR` to durable mounted volumes, and set a high-entropy `NCRP_SESSION_SECRET`. For a horizontally scaled production deployment, substitute the repository interface with PostgreSQL/storage/realtime infrastructure as described in [INTEGRATIONS.md](INTEGRATIONS.md).

`npm start` pins the standalone server to the repository-level database and upload directories. Container deployments should set both paths to absolute durable-volume locations.

Read [ARCHITECTURE.md](ARCHITECTURE.md), [DEMO.md](DEMO.md), [SEEDING.md](SEEDING.md), and [INTEGRATIONS.md](INTEGRATIONS.md).

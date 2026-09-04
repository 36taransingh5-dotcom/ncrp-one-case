# Seeding

All seeded data is synthetic. Reset commands never target arbitrary user data.

## Local demo

`npm run seed` idempotently creates the local dataset. `npm run reset-demo` deletes and recreates only known demo database rows and application-generated evidence files. The Playwright suite uses a separate `data/ncrp-e2e.db` and `uploads-e2e/` location.

## Supabase demo

After migrations are applied, set `NCRP_DEMO_CITIZEN_EMAIL`, `NCRP_DEMO_CITIZEN_PASSWORD`, `NCRP_DEMO_OPERATOR_EMAIL` and `NCRP_DEMO_OPERATOR_PASSWORD`, then run:

```bash
npm run seed:supabase
```

The script creates or reuses the two named synthetic Auth users, promotes only the operator account through the server-only admin client, upserts simulated institutions and invokes a service-role-only seed function. It replaces only `NCRP-26-847193`; arbitrary citizen-created cases are preserved.

The golden case starts at ₹48,500 reported: ₹31,200 secured, ₹12,000 tracing and ₹5,300 unrecovered. Its exact ₹6,700 movement can be secured once, producing ₹37,900 secured and ₹5,300 tracing. Idempotency and movement-state checks prevent a duplicate hold.

To promote a separate existing Auth user:

```bash
npm run provision-operator -- operator@example.org
```

Never put the Supabase secret key or demo passwords in source control.

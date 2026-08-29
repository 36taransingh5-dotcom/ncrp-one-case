# Seeding

`npm run seed` creates the demo dataset if it does not exist. `npm run reset-demo` recreates it from scratch.

Reset removes generated demo evidence files whose names match the application’s UUID-prefixed storage format, then recreates database entities and events. It does not recursively delete arbitrary files from the configured storage directory.

The golden case is `NCRP-26-847193`: Asha Mehta, bank impersonation plus malicious APK, ₹48,500 reported, ₹31,200 initially secured, ₹12,000 initially tracing, and ₹5,300 unrecovered. The validated operations action converts the traceable ₹6,700 secondary-account movement to secured, yielding ₹37,900 secured and ₹5,300 tracing.

The seed also creates investment-scam, marketplace-fraud and OTP/account-takeover cases so the operations queue is meaningful.

Golden-case timestamps are relative to the moment of seeding, not fixed calendar dates, so the timeline, elapsed times and SLA deadline remain truthful whenever the demo is reset. The case is left on a still-open freeze request for the remaining ₹12,000, which is what puts it in a genuine "waiting for HDFC Bank" state with roughly 40 minutes left on the two-hour response window.

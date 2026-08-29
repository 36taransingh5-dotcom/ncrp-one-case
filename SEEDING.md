# Seeding

`npm run seed` creates the demo dataset if it does not exist. `npm run reset-demo` recreates it from scratch.

The golden case is `NCRP-26-847193`: Asha Mehta, bank impersonation plus malicious APK, ₹48,500 reported, ₹31,200 initially secured, ₹12,000 initially tracing, and ₹5,300 unrecovered. The validated operations action converts the traceable ₹6,700 secondary-account movement to secured, yielding ₹37,900 secured and ₹5,300 tracing.

The seed also creates investment-scam, marketplace-fraud and OTP/account-takeover cases so the operations queue is meaningful.

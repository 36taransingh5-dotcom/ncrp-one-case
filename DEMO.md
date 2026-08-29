# 60-second judge demo

1. Open the landing page and read the proposition: **Report once. Government coordinates the rest.** Click **Enter citizen demo** — it opens case `NCRP-26-847193` directly.
2. The top of the page tells the whole story in three seconds: **₹48,500 reported stolen**, split by a proportional bar into **₹31,200 secured**, **₹12,000 being traced** and **₹5,300 unrecovered**. Point out that the three amounts reconcile exactly to the reported total.
3. Immediately below: **Nothing needed from you right now**, and **Waiting for HDFC Bank** with the request time, the two-hour response window and live elapsed time — all read from recorded timestamps.
4. Scroll to the money trail. It branches: your SBI account → the HDFC beneficiary account (₹31,200 held, ₹5,300 still traced) → onward to ICICI ••1834 (₹6,700) and an ATM withdrawal (₹5,300).
5. Open **Enter operations demo** in another tab. `NCRP-26-847193` is tagged **Demo case**, already selected, and **Secure ₹6,700** sits at the top of the action column showing ₹31,200 → ₹37,900. Click it.
6. Return to the citizen tab **without refreshing**. A notification appears — _₹6,700 additional funds secured_ — secured counts up to **₹37,900**, tracing drops to **₹5,300**, the bar re-proportions, the ICICI node turns green, and a new timeline entry appears.
7. Show the FIR review status and who is on the case.
8. Close: “One report. One case. Government coordinates the rest.”

Clicking **Secure ₹6,700** twice is rejected by the case engine, not just the button. Reset at any time from Operations or with `npm run reset-demo`; the golden case is re-anchored to the current time, so elapsed times and SLA deadlines stay truthful on any day.

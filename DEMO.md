# 60-second judge demo

1. Enter the citizen demo and open `NCRP-26-847193`. Point out ₹48,500 reported, ₹31,200 secured, ₹12,000 tracing and ₹5,300 unrecovered.
2. Scroll to the money trail and timeline. Explain that the trail and timeline are sourced from persisted movements and events.
3. Open **Operations demo** in another tab and select **Secure ₹6,700**.
4. Return to the citizen tab without refreshing. The SSE update changes secured funds to ₹37,900, tracing to ₹5,300, updates the ICICI node and inserts the additional-funds event.
5. Show the current owner, FIR review and open bank-statement request.
6. Close: “One report. One case. Government coordinates the rest.”

Reset at any time from Operations or with `npm run reset-demo`. The intake AI is intentionally not enabled in this demo; the structured seeded incident is deterministic and does not depend on an external model.

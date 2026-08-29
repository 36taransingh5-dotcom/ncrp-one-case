import { db, initializeDatabase } from "@/lib/db";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
function clearDemoUploads() {
  const uploadDir = path.resolve(
    /* turbopackIgnore: true */ process.env.NCRP_UPLOAD_DIR ||
      (process.env.VERCEL
        ? "/tmp/ncrp-one-case-uploads"
        : path.join(process.cwd(), "uploads")),
  );
  try {
    for (const entry of fs.readdirSync(/* turbopackIgnore: true */ uploadDir, {
      withFileTypes: true,
    })) {
      if (entry.isFile() && /^[0-9a-f-]{36}-/i.test(entry.name))
        fs.unlinkSync(
          path.join(/* turbopackIgnore: true */ uploadDir, entry.name),
        );
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
}
/**
 * The golden case is anchored to the moment it is seeded rather than to a fixed
 * calendar date, so elapsed times, SLA deadlines and the timeline stay truthful
 * whenever the demo is reset. `ago(minutes)` returns a timestamp that many
 * minutes before the seed instant.
 */
let seededAt = Date.now();
const ago = (minutes: number) =>
  new Date(seededAt - minutes * 60_000).toISOString();
let now = ago(0);
const event = (
  caseId: string,
  type: string,
  label: string,
  at: string,
  institutionId: string | null = "inst-hdfc",
) =>
  db
    .prepare("INSERT INTO case_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(
      crypto.randomUUID(),
      caseId,
      type,
      "system",
      null,
      institutionId,
      JSON.stringify({ label, simulated: true }),
      JSON.stringify({}),
      JSON.stringify({}),
      1,
      at,
      at,
    );
export function seedDemo(reset = false) {
  initializeDatabase();
  if (reset) {
    clearDemoUploads();
    db.exec(
      "DELETE FROM audit_logs; DELETE FROM notifications; DELETE FROM case_events; DELETE FROM fund_movements; DELETE FROM transactions; DELETE FROM evidence_requests; DELETE FROM evidence; DELETE FROM agency_assignments; DELETE FROM fir_records; DELETE FROM incidents; DELETE FROM cases; DELETE FROM citizens; DELETE FROM users; DELETE FROM institutions;",
    );
  }
  const exists = db.prepare("SELECT id FROM cases LIMIT 1").get();
  if (exists) return;
  seededAt = Date.now();
  now = ago(0);
  const users = [
    ["user-asha", "citizen@demo.onecase.in", "Asha Mehta", "citizen"],
    ["user-priya", "operator@demo.onecase.in", "Priya Nair", "operator"],
    ["user-rohan", "citizen2@demo.onecase.in", "Rohan Shah", "citizen"],
    ["user-neha", "citizen3@demo.onecase.in", "Neha Kapoor", "citizen"],
    ["user-omar", "citizen4@demo.onecase.in", "Omar Khan", "citizen"],
  ];
  for (const u of users)
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(...u, now, now);
  const institutions = [
    [
      "inst-sbi",
      "SBI (simulated)",
      "bank",
      "SBI",
      "Bengaluru",
      "Karnataka",
      1,
      now,
    ],
    [
      "inst-hdfc",
      "HDFC Bank — Fraud Response (simulated)",
      "bank",
      "HDFC",
      "Mumbai",
      "Maharashtra",
      1,
      now,
    ],
    [
      "inst-icici",
      "ICICI Bank — Fraud Response (simulated)",
      "bank",
      "ICICI",
      "Mumbai",
      "Maharashtra",
      1,
      now,
    ],
    [
      "inst-cyber",
      "Bengaluru Cyber Crime Unit (simulated)",
      "cyber_cell",
      "BLR-CCU",
      "Bengaluru",
      "Karnataka",
      1,
      now,
    ],
    [
      "inst-police",
      "Bengaluru Cyber Crime Police Station (simulated)",
      "police",
      "BCPS",
      "Bengaluru",
      "Karnataka",
      1,
      now,
    ],
  ];
  for (const i of institutions)
    db.prepare("INSERT INTO institutions VALUES(?,?,?,?,?,?,?,?)").run(...i);
  const citizens = [
    [
      "cit-asha",
      "user-asha",
      "Asha Mehta",
      "+91 •••• 4408",
      "Bengaluru",
      "Karnataka",
      "en",
      now,
    ],
    [
      "cit-rohan",
      "user-rohan",
      "Rohan Shah",
      "+91 •••• 0139",
      "Pune",
      "Maharashtra",
      "en",
      now,
    ],
    [
      "cit-neha",
      "user-neha",
      "Neha Kapoor",
      "+91 •••• 2350",
      "Delhi",
      "Delhi",
      "en",
      now,
    ],
    [
      "cit-omar",
      "user-omar",
      "Omar Khan",
      "+91 •••• 1620",
      "Hyderabad",
      "Telangana",
      "en",
      now,
    ],
  ];
  for (const c of citizens)
    db.prepare("INSERT INTO citizens VALUES(?,?,?,?,?,?,?,?)").run(...c);
  const cs = [
    [
      "case-golden",
      "NCRP-26-847193",
      "cit-asha",
      "Financial cyber fraud",
      "PARTIALLY_SECURED",
      "urgent",
      48500,
      31200,
      12000,
      5300,
      "bank",
      "HDFC Bank — fraud response team",
      "PARTIALLY SECURED",
      ago(93),
      now,
      null,
      now,
      now,
    ],
    [
      "case-b",
      "NCRP-26-781304",
      "cit-rohan",
      "Investment scam",
      "INVESTIGATION",
      "high",
      375000,
      0,
      375000,
      0,
      "government",
      "Pune Cyber Crime Unit",
      "INVESTIGATION",
      now,
      now,
      null,
      now,
      now,
    ],
    [
      "case-c",
      "NCRP-26-553921",
      "cit-neha",
      "Marketplace fraud",
      "FIR_REVIEW",
      "medium",
      18900,
      18900,
      0,
      0,
      "police",
      "Delhi Cyber Crime Unit",
      "FIR REVIEW",
      now,
      now,
      null,
      now,
      now,
    ],
    [
      "case-d",
      "NCRP-26-420187",
      "cit-omar",
      "OTP / account takeover",
      "FINANCIAL_INTERVENTION",
      "urgent",
      82000,
      0,
      82000,
      0,
      "bank",
      "SBI (simulated)",
      "FINANCIAL INTERVENTION",
      now,
      now,
      null,
      now,
      now,
    ],
  ];
  for (const c of cs)
    db.prepare(
      "INSERT INTO cases VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(...c);
  db.prepare("INSERT INTO incidents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
    "inc-golden",
    "case-golden",
    "Someone claiming to be from SBI said KYC was expiring and asked me to install an APK sent over WhatsApp. ₹48,500 was transferred.",
    "Bank impersonation with malicious APK and unauthorised transfer.",
    "Financial cyber fraud",
    "Bank impersonation + malicious APK",
    "SBI (simulated)",
    "UPI / bank transfer",
    ago(138),
    ago(93),
    "Bengaluru",
    0.92,
    now,
    now,
  );
  for (const c of cs.slice(1))
    db.prepare("INSERT INTO incidents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      `inc-${c[0]}`,
      c[0],
      "Synthetic demo incident",
      "Synthetic structured incident",
      c[3],
      c[3],
      null,
      "Bank transfer",
      now,
      now,
      "Synthetic",
      0.8,
      now,
      now,
    );
  const tx = [
    [
      "tx-source",
      "case-golden",
      null,
      "SIM-SBI-48500",
      "inst-sbi",
      "outbound",
      48500,
      "upi",
      "identified",
      ago(138),
      "HDFC ••9281",
      "SBI ••4408",
      "{}",
      now,
    ],
    [
      "tx-hdfc",
      "case-golden",
      "tx-source",
      "SIM-HDFC-31200",
      "inst-hdfc",
      "inbound",
      31200,
      "transfer",
      "secured",
      ago(137),
      "HDFC ••9281",
      "SBI ••4408",
      "{}",
      now,
    ],
    [
      "tx-icici",
      "case-golden",
      "tx-source",
      "SIM-ICICI-6700",
      "inst-icici",
      "inbound",
      6700,
      "transfer",
      "tracing",
      ago(136),
      "ICICI ••1834",
      "HDFC ••9281",
      "{}",
      now,
    ],
    [
      "tx-trace",
      "case-golden",
      "tx-source",
      "SIM-HDFC-5300",
      "inst-hdfc",
      "inbound",
      5300,
      "transfer",
      "tracing",
      ago(136),
      "HDFC ••9281",
      "SBI ••4408",
      "{}",
      now,
    ],
    [
      "tx-atm",
      "case-golden",
      "tx-source",
      "SIM-ATM-5300",
      "inst-hdfc",
      "outbound",
      5300,
      "atm",
      "withdrawn",
      ago(132),
      "ATM withdrawal",
      "HDFC ••9281",
      "{}",
      now,
    ],
  ];
  for (const t of tx)
    db.prepare(
      "INSERT INTO transactions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(...t);
  const mv = [
    [
      "mv-one",
      "case-golden",
      "tx-source",
      "tx-hdfc",
      31200,
      "secured",
      ago(83),
      ago(83),
    ],
    [
      "mv-two",
      "case-golden",
      "tx-source",
      "tx-icici",
      6700,
      "tracing",
      ago(81),
      ago(81),
    ],
    [
      "mv-three",
      "case-golden",
      "tx-source",
      "tx-trace",
      5300,
      "tracing",
      ago(80),
      ago(80),
    ],
    [
      "mv-four",
      "case-golden",
      "tx-source",
      "tx-atm",
      5300,
      "unrecovered",
      ago(80),
      ago(80),
    ],
  ];
  for (const m of mv)
    db.prepare("INSERT INTO fund_movements VALUES(?,?,?,?,?,?,?,?)").run(...m);
  /**
   * The golden timeline ends on a still-open freeze request: HDFC answered the
   * first request with a partial recovery, and the remaining traceable ₹12,000
   * is what the beneficiary bank still owes a response on. The SLA snapshot is
   * read from the most recent freeze request, so this is what puts the case in
   * a truthful "waiting for HDFC Bank" state with 42 minutes left on the clock.
   */
  const events: [string, string, string, string | null][] = [
    ["CASE_CREATED", "Complaint received", ago(93), null],
    [
      "INCIDENT_CLASSIFIED",
      "Report structured for financial intervention",
      ago(92),
      null,
    ],
    [
      "TRANSACTION_IDENTIFIED",
      "Transaction identified from the reported details",
      ago(91),
      "inst-sbi",
    ],
    ["SENDER_BANK_NOTIFIED", "Sender bank notified", ago(90), "inst-sbi"],
    [
      "BENEFICIARY_BANK_IDENTIFIED",
      "Beneficiary bank identified",
      ago(89),
      "inst-hdfc",
    ],
    [
      "FREEZE_REQUEST_CREATED",
      "Freeze request sent to beneficiary bank",
      ago(88),
      "inst-hdfc",
    ],
    [
      "FUNDS_PARTIALLY_SECURED",
      "₹31,200 secured in primary beneficiary account",
      ago(83),
      "inst-hdfc",
    ],
    [
      "FUNDS_MOVED",
      "₹6,700 traced onward to a second account",
      ago(81),
      "inst-icici",
    ],
    [
      "FUNDS_WITHDRAWN",
      "₹5,300 withdrawn before the hold took effect",
      ago(80),
      "inst-hdfc",
    ],
    [
      "FREEZE_REQUEST_CREATED",
      "Freeze request sent for the remaining ₹12,000",
      ago(78),
      "inst-hdfc",
    ],
    [
      "CYBER_CELL_ASSIGNED",
      "Bengaluru Cyber Crime Unit assigned",
      ago(60),
      "inst-cyber",
    ],
    ["FIR_REVIEW_STARTED", "FIR review started", ago(42), "inst-police"],
  ];
  for (const e of events) event("case-golden", e[0], e[1], e[2], e[3]);
  db.prepare("INSERT INTO agency_assignments VALUES(?,?,?,?,?,?,?,?,?)").run(
    "assign-cyber",
    "case-golden",
    "inst-cyber",
    "investigation",
    "acknowledged",
    ago(60),
    ago(59),
    null,
    now,
  );
  db.prepare("INSERT INTO fir_records VALUES(?,?,?,?,?,?,?,?,?)").run(
    "fir-golden",
    "case-golden",
    "under_review",
    null,
    "Bengaluru Cyber Crime Police Station (simulated)",
    null,
    "Police are reviewing your case. No decision has been made yet.",
    now,
    now,
  );
  db.prepare("INSERT INTO notifications VALUES(?,?,?,?,?,?,?,?)").run(
    "note-golden",
    "user-asha",
    "case-golden",
    "case_update",
    "Freeze request sent",
    "The beneficiary bank has been asked to hold the money that is still being traced.",
    null,
    now,
  );
}

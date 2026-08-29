import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("persisted evidence, fund actions and automatic SLA escalation remain consistent", async () => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ncrp-one-case-"));
  process.env.NCRP_DATABASE_PATH = path.join(testRoot, "test.db");
  process.env.NCRP_UPLOAD_DIR = path.join(testRoot, "uploads");
  const [
    { seedDemo },
    { db },
    { createEvidence, getCaseByPublicId, secureAdditionalFunds },
  ] = await Promise.all([
    import("../lib/seed"),
    import("../lib/db"),
    import("../lib/case-engine"),
  ]);
  try {
    seedDemo(true);
    const citizen = db
      .prepare(
        "SELECT id FROM users WHERE role='citizen' ORDER BY created_at LIMIT 1",
      )
      .get() as { id: string };
    createEvidence({
      caseId: "case-golden",
      userId: citizen.id,
      type: "financial",
      title: "Test statement",
      path: "test.txt",
      mime: "text/plain",
      size: 4,
      sha256: "a".repeat(64),
    });
    assert.equal(
      (
        db.prepare("SELECT COUNT(*) count FROM evidence").get() as {
          count: number;
        }
      ).count,
      1,
    );
    assert.equal(
      (
        db
          .prepare("SELECT status FROM evidence_requests WHERE id='req-golden'")
          .get() as { status: string }
      ).status,
      "submitted",
    );

    db.prepare(
      "DELETE FROM case_events WHERE case_id='case-golden' AND event_type='FUNDS_PARTIALLY_SECURED'",
    ).run();
    db.prepare(
      "UPDATE case_events SET occurred_at=? WHERE case_id='case-golden' AND event_type='FREEZE_REQUEST_CREATED'",
    ).run(new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString());
    assert.equal(getCaseByPublicId("NCRP-26-847193")?.sla.status, "breached");
    getCaseByPublicId("NCRP-26-847193");
    assert.equal(
      (
        db
          .prepare(
            "SELECT COUNT(*) count FROM case_events WHERE case_id='case-golden' AND event_type='SLA_BREACHED'",
          )
          .get() as { count: number }
      ).count,
      1,
    );

    const operator = db
      .prepare("SELECT id FROM users WHERE role='operator'")
      .get() as { id: string };
    const updated = await secureAdditionalFunds(
      "NCRP-26-847193",
      operator.id,
      6700,
    );
    assert.equal(updated?.case.secured_amount, 37900);
    assert.equal(updated?.case.tracing_amount, 5300);
    assert.equal(updated?.audits?.length, 1);
  } finally {
    db.close();
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});

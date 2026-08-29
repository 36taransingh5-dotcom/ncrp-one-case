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
    {
      createCaseFromIntake,
      createEvidence,
      executeOperatorAction,
      getCaseByPublicId,
      secureAdditionalFunds,
    },
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

    const created = createCaseFromIntake({
      userId: citizen.id,
      description:
        "A synthetic caller claimed my bank account needed an urgent update and asked for a transfer.",
      amount: 1200,
    });
    const identified = await executeOperatorAction(
      created.publicId,
      operator.id,
      {
        type: "IDENTIFY_BENEFICIARY_BANK",
      },
    );
    assert.equal(identified?.case.case_status, "FINANCIAL_INTERVENTION");
    const frozen = await executeOperatorAction(created.publicId, operator.id, {
      type: "SEND_FREEZE_REQUEST",
    });
    assert.equal(
      frozen?.events.some(
        (event) => event.event_type === "FREEZE_REQUEST_CREATED",
      ),
      true,
    );
    const moved = await executeOperatorAction(created.publicId, operator.id, {
      type: "MARK_FUNDS_MOVED",
    });
    assert.equal(moved?.case.tracing_amount, 1200);
    const withdrawn = await executeOperatorAction(
      created.publicId,
      operator.id,
      {
        type: "MARK_FUNDS_WITHDRAWN",
      },
    );
    assert.equal(withdrawn?.case.unrecovered_amount, 1200);
    const assigned = await executeOperatorAction(
      created.publicId,
      operator.id,
      {
        type: "ASSIGN_CYBER_CELL",
      },
    );
    assert.equal(
      assigned?.assignments.some(
        (assignment) =>
          assignment.institution_name ===
          "Bengaluru Cyber Crime Unit (simulated)",
      ),
      true,
    );
  } finally {
    db.close();
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});

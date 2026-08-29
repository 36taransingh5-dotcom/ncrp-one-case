import test from "node:test";
import assert from "node:assert/strict";
import { reconcileMovements } from "../lib/domain/money";
import { assertTransition, canTransition } from "../lib/domain/state-machine";
import { calculateSlaTiming } from "../lib/domain/sla";
import { classifyIncident } from "../lib/ai/intake";
import { buildFundFlow, flattenFlow } from "../lib/domain/fund-graph";

test("golden case money reconciles before and after the ₹6,700 action", () => {
  const initial = reconcileMovements([
    { movement_status: "secured", amount: 31_200 },
    { movement_status: "tracing", amount: 6_700 },
    { movement_status: "tracing", amount: 5_300 },
    { movement_status: "unrecovered", amount: 5_300 },
  ]);
  assert.deepEqual(initial, {
    secured: 31_200,
    tracing: 12_000,
    unrecovered: 5_300,
  });
  assert.equal(initial.secured + initial.tracing + initial.unrecovered, 48_500);

  const updated = reconcileMovements([
    { movement_status: "secured", amount: 31_200 },
    { movement_status: "secured", amount: 6_700 },
    { movement_status: "tracing", amount: 5_300 },
    { movement_status: "unrecovered", amount: 5_300 },
  ]);
  assert.deepEqual(updated, {
    secured: 37_900,
    tracing: 5_300,
    unrecovered: 5_300,
  });
  assert.equal(updated.secured + updated.tracing + updated.unrecovered, 48_500);
});

test("case state machine permits forward workflow transitions", () => {
  assert.equal(canTransition("PARTIALLY_SECURED", "INVESTIGATION"), true);
  assert.equal(canTransition("INVESTIGATION", "FIR_REVIEW"), true);
  assert.equal(canTransition("RESOLUTION", "CLOSED"), true);
});

test("case state machine rejects backwards and invalid transitions", () => {
  assert.equal(canTransition("CLOSED", "REPORTED"), false);
  assert.throws(
    () => assertTransition("INVESTIGATION", "REPORTED"),
    /Invalid case transition/,
  );
});

test("SLA timing is derived from persisted timestamps", () => {
  const requestedAt = "2026-08-29T10:00:00.000Z";
  assert.equal(
    calculateSlaTiming({
      requestedAt,
      nowMs: new Date("2026-08-29T11:00:00.000Z").getTime(),
    }).status,
    "waiting",
  );
  assert.equal(
    calculateSlaTiming({
      requestedAt,
      nowMs: new Date("2026-08-29T12:01:00.000Z").getTime(),
    }).status,
    "overdue",
  );
  assert.equal(
    calculateSlaTiming({
      requestedAt,
      respondedAt: "2026-08-29T11:30:00.000Z",
      nowMs: new Date("2026-08-29T13:00:00.000Z").getTime(),
    }).status,
    "met",
  );
  assert.equal(
    calculateSlaTiming({
      requestedAt,
      respondedAt: "2026-08-29T12:30:00.000Z",
      nowMs: new Date("2026-08-29T13:00:00.000Z").getTime(),
    }).status,
    "overdue",
  );
});

test("intake classification is deterministic and exposes a reviewable interpretation", () => {
  assert.deepEqual(
    classifyIncident(
      "Someone claiming to be from SBI said my KYC was due and asked me to install an APK from WhatsApp before a bank transfer.",
    ),
    {
      fraudType: "Financial cyber fraud",
      mechanism: "Bank impersonation + malicious APK",
      paymentChannel: "Bank transfer",
      impersonatedEntity: "SBI (reported by citizen)",
      confidence: 0.82,
      summary:
        "Reported bank impersonation involving a malicious application and an unauthorised payment.",
    },
  );
});

test("fund graph rebuilds the branching account tree from movement rows", () => {
  const flow = buildFundFlow({
    reportedAmount: 48_500,
    movements: [
      {
        id: "mv-one",
        amount: 31_200,
        movement_status: "secured",
        origin_account: "SBI ••4408",
        from_account: "SBI ••4408",
        to_account: "HDFC ••9281",
        to_institution: "HDFC Bank",
      },
      {
        id: "mv-two",
        amount: 6_700,
        movement_status: "tracing",
        origin_account: "SBI ••4408",
        from_account: "HDFC ••9281",
        to_account: "ICICI ••1834",
        to_institution: "ICICI Bank",
      },
      {
        id: "mv-three",
        amount: 5_300,
        movement_status: "tracing",
        origin_account: "SBI ••4408",
        from_account: "SBI ••4408",
        to_account: "HDFC ••9281",
        to_institution: "HDFC Bank",
      },
      {
        id: "mv-four",
        amount: 5_300,
        movement_status: "unrecovered",
        origin_account: "SBI ••4408",
        from_account: "HDFC ••9281",
        to_account: "ATM withdrawal",
        to_institution: "HDFC Bank",
      },
    ],
  });

  const root = flow.root!;
  assert.equal(root.account, "SBI ••4408");
  assert.equal(root.total, 48_500);
  assert.equal(root.children.length, 1);

  const beneficiary = root.children[0];
  assert.equal(beneficiary.account, "HDFC ••9281");
  assert.equal(beneficiary.total, 48_500);
  assert.deepEqual(
    beneficiary.dispositions.map((item) => [item.amount, item.status]),
    [
      [31_200, "secured"],
      [5_300, "tracing"],
    ],
  );

  assert.deepEqual(
    beneficiary.children.map((child) => [child.account, child.total]),
    [
      ["ICICI ••1834", 6_700],
      ["ATM withdrawal", 5_300],
    ],
  );

  assert.equal(flow.reconciled, true);
  assert.deepEqual(flow.totals, {
    secured: 31_200,
    tracing: 12_000,
    unrecovered: 5_300,
  });
  assert.equal(flattenFlow(root).length, 4);
});

test("fund graph tolerates a freshly created case with no traced accounts", () => {
  const flow = buildFundFlow({
    reportedAmount: 1_200,
    movements: [{ id: "mv", amount: 1_200, movement_status: "tracing" }],
  });
  assert.equal(flow.root?.total, 1_200);
  assert.equal(flow.root?.children.length, 1);
  assert.equal(flow.reconciled, true);
});

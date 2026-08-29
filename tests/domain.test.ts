import test from "node:test";
import assert from "node:assert/strict";
import { reconcileMovements } from "../lib/domain/money";
import { assertTransition, canTransition } from "../lib/domain/state-machine";
import { calculateSlaTiming } from "../lib/domain/sla";

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

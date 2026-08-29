import test from "node:test";
import assert from "node:assert/strict";
import { reconcileMovements } from "../lib/domain/money";
import { assertTransition, canTransition } from "../lib/domain/state-machine";

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

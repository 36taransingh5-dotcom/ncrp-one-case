import { test } from "node:test";
import assert from "node:assert/strict";
import { groundIdentifiers, intelligenceSchema } from "../lib/ai/schema";

const result = {
  summary: "Reported UPI fraud",
  fraudType: "Bank impersonation / phishing",
  reportedAmount: 48500,
  paymentChannel: "UPI",
  sourceInstitution: "SBI",
  beneficiaryInstitution: "HDFC",
  transactionReferences: ["MADE-UP"],
  incidentDate: null,
  incidentTime: "14:15",
  evidenceMentioned: [],
  known: [],
  inferred: [],
  missingInformation: ["Transaction reference"],
  recommendedAction: "REQUEST_TRANSACTION_REFERENCE",
  reason: "Missing reference",
};
test("AI schema rejects unapproved commands and invented fields", () => {
  assert.equal(
    intelligenceSchema.safeParse({
      ...result,
      recommendedAction: "REGISTER_FIR",
    }).success,
    false,
  );
  assert.equal(
    intelligenceSchema.safeParse({ ...result, execute: true }).success,
    false,
  );
  assert.equal(
    intelligenceSchema.safeParse({ ...result, incidentTime: "99:15" }).success,
    false,
  );
});
test("unsupported identifiers and amounts are removed from AI suggestions", () => {
  const grounded = groundIdentifiers(
    intelligenceSchema.parse(result),
    "I paid ₹48,500 by UPI. Someone claimed to be SBI.",
  );
  assert.equal(grounded.reportedAmount, 48500);
  assert.equal(grounded.sourceInstitution, "SBI");
  assert.equal(grounded.beneficiaryInstitution, null);
  assert.deepEqual(grounded.transactionReferences, []);
  assert.equal(
    groundIdentifiers(grounded, "An unknown amount was lost").reportedAmount,
    null,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyReportDetails,
  reportDetailsSchema,
  reportNarrative,
} from "../lib/report-details";

test("expanded report requires transaction and location details and validates optional identifiers", () => {
  assert.equal(
    reportDetailsSchema.safeParse(emptyReportDetails).success,
    false,
  );
  const details = {
    ...emptyReportDetails,
    location: "Demo Delhi",
    bank: "Demo Bank",
    transactionDate: "2026-09-08",
  };
  assert.equal(reportDetailsSchema.safeParse(details).success, true);
  assert.equal(
    reportDetailsSchema.safeParse({ ...details, transactionDate: "2026-02-31" })
      .success,
    false,
  );
  assert.equal(
    reportDetailsSchema.safeParse({ ...details, suspectEmail: "not-email" })
      .success,
    false,
  );
  assert.equal(
    reportDetailsSchema.safeParse({ ...details, suspectWebsite: "not-url" })
      .success,
    false,
  );
  assert.match(
    reportNarrative("Synthetic incident", {
      ...details,
      suspectName: "Demo suspect",
    }),
    /Suspect name \(if known\): Demo suspect/,
  );
  assert.match(
    reportNarrative("Synthetic incident", details),
    /Date of transaction: 2026-09-08/,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import type { CaseDetail } from "../lib/types";
import { buildCitizenCaseSummary } from "../lib/domain/citizen-summary";

function detail(overrides: {
  status?: string;
  ownerType?: string;
  ownerName?: string;
  reported?: number;
  secured?: number;
  tracing?: number;
  events?: string[];
  sla?: string;
  firStatus?: string;
  firNumber?: string | null;
  evidence?: { title: string; description: string; status?: string };
}): CaseDetail {
  return {
    case: {
      case_status: overrides.status || "REPORTED",
      current_owner_type: overrides.ownerType || "",
      current_owner_name: overrides.ownerName || "",
      reported_amount: overrides.reported ?? 48_500,
      secured_amount: overrides.secured ?? 0,
      tracing_amount: overrides.tracing ?? 0,
    },
    citizen: {},
    incident: {},
    events: (overrides.events || []).map((event_type) => ({ event_type })),
    movements: [],
    evidence: [],
    evidenceRequests: overrides.evidence
      ? [
          {
            title: overrides.evidence.title,
            description: overrides.evidence.description,
            status: overrides.evidence.status || "open",
          },
        ]
      : [],
    assignments: [],
    fir: {
      fir_status: overrides.firStatus || "not_started",
      fir_number: overrides.firNumber || null,
    },
    notifications: [],
    sla: { status: overrides.sla || "not_applicable" },
  };
}

test("citizen summary uses live money, freeze wait, and FIR without inventing a number", () => {
  const summary = buildCitizenCaseSummary(
    detail({
      status: "PARTIALLY_SECURED",
      ownerType: "bank",
      ownerName: "HDFC Bank — fraud response team",
      secured: 31_200,
      tracing: 12_000,
      events: ["BENEFICIARY_BANK_IDENTIFIED", "FREEZE_REQUEST_CREATED"],
      sla: "waiting",
      firStatus: "under_review",
    }),
  );
  assert.equal(summary.moneyProtected, "₹31,200 of ₹48,500");
  assert.equal(
    summary.happeningNow,
    "HDFC Bank is responding to a freeze request.",
  );
  assert.equal(summary.youNeedToDo, "Nothing right now.");
  assert.equal(summary.firStatus, "Under review");
  assert.equal(summary.firNumber, null);
});

test("citizen summary names FIR review, investigation, and resolved states from case status", () => {
  assert.equal(
    buildCitizenCaseSummary(detail({ status: "FIR_REVIEW" })).happeningNow,
    "Police review started.",
  );
  assert.equal(
    buildCitizenCaseSummary(detail({ status: "INVESTIGATION" })).happeningNow,
    "The cyber cell is reviewing the case.",
  );
  assert.equal(
    buildCitizenCaseSummary(detail({ status: "RESOLUTION" })).happeningNow,
    "Your case has been resolved.",
  );
});

test("citizen summary asks for evidence in plain language and does not invent an FIR number", () => {
  assert.equal(
    buildCitizenCaseSummary(
      detail({
        evidence: {
          title: "Transaction receipt",
          description: "Upload the receipt for the reported payment.",
        },
      }),
    ).youNeedToDo,
    "Upload the requested transaction receipt.",
  );
  assert.equal(
    buildCitizenCaseSummary(
      detail({
        evidence: {
          title: "Payment UTR",
          description: "Provide the transaction reference if you have it.",
        },
      }),
    ).youNeedToDo,
    "Provide the transaction reference.",
  );
  assert.equal(
    buildCitizenCaseSummary(
      detail({
        evidence: {
          title: "Updated bank statement needed",
          description: "Upload a bank statement covering the latest 48 hours.",
        },
      }),
      { sessionExpired: true },
    ).youNeedToDo,
    "Sign in to attach the requested document.",
  );
  const registered = buildCitizenCaseSummary(
    detail({
      status: "FIR_REGISTERED",
      firStatus: "registered",
      firNumber: "SIM-FIR-246/2026",
    }),
  );
  assert.equal(registered.firStatus, "Registered");
  assert.equal(registered.firNumber, "SIM-FIR-246/2026");
  assert.equal(registered.happeningNow, "An FIR has been registered.");
});

test("citizen summary identifies the bank before a freeze exists", () => {
  assert.equal(
    buildCitizenCaseSummary(
      detail({ status: "FINANCIAL_INTERVENTION", tracing: 82_000 }),
    ).happeningNow,
    "We are identifying the beneficiary bank.",
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import type { CaseDetail } from "../lib/types";
import { buildOperatorCaseSummary } from "../lib/domain/operator-summary";

function detail(
  overrides: {
    id?: string;
    status?: string;
    ownerType?: string;
    ownerName?: string;
    reported?: number;
    secured?: number;
    tracing?: number;
    unrecovered?: number;
    events?: string[];
    sla?: string;
    deadlineAt?: string;
    evidenceOpen?: boolean;
  } = {},
): CaseDetail {
  return {
    case: {
      public_case_id: overrides.id || "NCRP-26-847193",
      case_status: overrides.status || "PARTIALLY_SECURED",
      current_owner_type: overrides.ownerType || "bank",
      current_owner_name:
        overrides.ownerName !== undefined
          ? overrides.ownerName
          : "HDFC Bank — fraud response team",
      reported_amount: overrides.reported ?? 48_500,
      secured_amount: overrides.secured ?? 31_200,
      tracing_amount: overrides.tracing ?? 12_000,
      unrecovered_amount: overrides.unrecovered ?? 5_300,
    },
    citizen: {},
    incident: {},
    events: (overrides.events || []).map((event_type) => ({ event_type })),
    movements: [],
    evidence: [],
    evidenceRequests: overrides.evidenceOpen
      ? [{ status: "open", title: "Updated bank statement needed" }]
      : [],
    assignments: [],
    fir: {},
    notifications: [],
    sla: {
      status: overrides.sla || "not_applicable",
      deadlineAt: overrides.deadlineAt,
    },
  };
}

test("operator summary uses live money, freeze wait, SLA remaining and no fake AI", () => {
  const nowMs = Date.parse("2026-09-08T14:00:00.000Z");
  const summary = buildOperatorCaseSummary(
    detail({
      events: ["BENEFICIARY_BANK_IDENTIFIED", "FREEZE_REQUEST_CREATED"],
      sla: "waiting",
      deadlineAt: "2026-09-08T14:27:00.000Z",
    }),
    { nowMs },
  );
  assert.equal(summary.caseId, "NCRP-26-847193");
  assert.equal(summary.reported, "₹48,500");
  assert.equal(summary.secured, "₹31,200");
  assert.equal(summary.tracing, "₹12,000");
  assert.equal(summary.unrecovered, "₹5,300");
  assert.equal(summary.nextAction, "HDFC Bank must respond to freeze request");
  assert.equal(summary.owner, "HDFC Bank — fraud response team");
  assert.equal(summary.blocker, "Waiting for bank response");
  assert.equal(summary.sla, "27 min remaining");
  assert.equal(summary.aiRecommendation, "No AI recommendation yet");
});

test("operator summary names blockers from case state and reuses an existing AI action", () => {
  assert.equal(
    buildOperatorCaseSummary(
      detail({
        status: "REPORTED",
        ownerName: "",
        events: [],
        sla: "not_applicable",
      }),
    ).blocker,
    "Beneficiary bank not yet identified",
  );
  assert.equal(
    buildOperatorCaseSummary(detail({ evidenceOpen: true })).blocker,
    "Evidence requested from citizen",
  );
  assert.equal(
    buildOperatorCaseSummary(detail({ status: "FIR_REVIEW" })).blocker,
    "Police review pending",
  );
  assert.equal(
    buildOperatorCaseSummary(detail({ status: "RESOLUTION" })).blocker,
    "Case resolved",
  );
  assert.equal(
    buildOperatorCaseSummary(
      detail({
        events: ["BENEFICIARY_BANK_IDENTIFIED"],
        sla: "not_applicable",
      }),
    ).blocker,
    "Police assignment pending",
  );
  assert.equal(
    buildOperatorCaseSummary(detail(), {
      recommendedAction: "REQUEST_TRANSACTION_REFERENCE",
    }).aiRecommendation,
    "Request beneficiary transaction reference",
  );
});

test("operator summary uses live SLA state and a neutral owner fallback", () => {
  assert.equal(
    buildOperatorCaseSummary(detail({ sla: "not_applicable", ownerName: "" }))
      .owner,
    "Not assigned yet",
  );
  assert.equal(
    buildOperatorCaseSummary(detail({ sla: "not_applicable" })).sla,
    "No active SLA",
  );
  assert.equal(
    buildOperatorCaseSummary(detail({ sla: "overdue" })).sla,
    "Overdue",
  );
  assert.equal(
    buildOperatorCaseSummary(detail({ sla: "met" })).sla,
    "Response received",
  );
});

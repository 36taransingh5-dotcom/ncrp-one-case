import type { CaseDetail } from "@/lib/types";

const rupee = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

export const AI_RECOMMENDATION_LABEL: Record<string, string> = {
  REQUEST_TRANSACTION_REFERENCE: "Request beneficiary transaction reference",
  REQUEST_BENEFICIARY_DETAILS: "Request beneficiary details",
  REQUEST_EVIDENCE: "Request evidence",
  IDENTIFY_BENEFICIARY_BANK: "Identify the beneficiary bank",
  SEND_FREEZE_REQUEST: "Send a freeze request",
  ASSIGN_CYBER_CELL: "Assign the cyber cell",
  START_FIR_REVIEW: "Start FIR review",
  NO_ACTION: "No action",
};

export type OperatorCaseSummary = {
  caseId: string;
  reported: string;
  secured: string;
  tracing: string;
  unrecovered: string;
  nextAction: string;
  owner: string;
  blocker: string;
  sla: string;
  aiRecommendation: string;
};

function hasEvent(detail: CaseDetail, type: string) {
  return detail.events.some((event) => String(event.event_type) === type);
}

function cleanOwner(value: unknown) {
  return String(value || "")
    .replace(/\s*\(simulated\)/i, "")
    .trim();
}

function bankName(value: unknown) {
  return (
    String(value || "")
      .replace(/\s*\(simulated\)/i, "")
      .replace(/\s*—.*$/, "")
      .trim() || "the bank"
  );
}

function formatRemaining(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min remaining`;
  if (!minutes) return `${hours} h remaining`;
  return `${hours} h ${minutes} min remaining`;
}

function slaState(detail: CaseDetail, nowMs: number) {
  const status = String(detail.sla.status || "not_applicable");
  if (status === "not_applicable") return "No active SLA";
  if (status === "met") return "Response received";
  if (status === "overdue" || status === "breached") return "Overdue";
  const deadline = detail.sla.deadlineAt
    ? new Date(String(detail.sla.deadlineAt)).getTime()
    : NaN;
  if (!Number.isFinite(deadline)) return "Waiting";
  const remaining = deadline - nowMs;
  if (remaining <= 0) return "Overdue";
  return formatRemaining(remaining);
}

function nextActionAndBlocker(detail: CaseDetail) {
  const status = String(detail.case.case_status || "");
  const sla = String(detail.sla.status || "not_applicable");
  const freezeWaiting =
    hasEvent(detail, "FREEZE_REQUEST_CREATED") &&
    (sla === "waiting" || sla === "overdue" || sla === "breached");
  const openEvidence = detail.evidenceRequests.some(
    (request) => String(request.status) === "open",
  );

  if (status === "CLOSED" || status === "RESOLUTION")
    return { nextAction: "None", blocker: "Case resolved" };
  if (openEvidence)
    return {
      nextAction: "Citizen must attach the requested document",
      blocker: "Evidence requested from citizen",
    };
  if (freezeWaiting)
    return {
      nextAction: `${bankName(detail.case.current_owner_name)} must respond to freeze request`,
      blocker: "Waiting for bank response",
    };
  if (status === "FIR_REVIEW")
    return {
      nextAction: "Complete police review",
      blocker: "Police review pending",
    };
  if (!hasEvent(detail, "BENEFICIARY_BANK_IDENTIFIED"))
    return {
      nextAction: "Identify the beneficiary bank",
      blocker: "Beneficiary bank not yet identified",
    };
  if (!hasEvent(detail, "CYBER_CELL_ASSIGNED"))
    return {
      nextAction: "Assign the cyber cell",
      blocker: "Police assignment pending",
    };
  return {
    nextAction: "Operator action required",
    blocker: "No blocker — operator action required",
  };
}

export function buildOperatorCaseSummary(
  detail: CaseDetail,
  input: { nowMs?: number; recommendedAction?: string | null } = {},
): OperatorCaseSummary {
  const nowMs = input.nowMs ?? Date.now();
  const owner = cleanOwner(detail.case.current_owner_name);
  const { nextAction, blocker } = nextActionAndBlocker(detail);
  const ai =
    (input.recommendedAction &&
      AI_RECOMMENDATION_LABEL[input.recommendedAction]) ||
    "No AI recommendation yet";
  return {
    caseId: String(detail.case.public_case_id || "Unknown case"),
    reported: rupee(Number(detail.case.reported_amount || 0)),
    secured: rupee(Number(detail.case.secured_amount || 0)),
    tracing: rupee(Number(detail.case.tracing_amount || 0)),
    unrecovered: rupee(Number(detail.case.unrecovered_amount || 0)),
    nextAction,
    owner: owner || "Not assigned yet",
    blocker,
    sla: slaState(detail, nowMs),
    aiRecommendation: ai,
  };
}

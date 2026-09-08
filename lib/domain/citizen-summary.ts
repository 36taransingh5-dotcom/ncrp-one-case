import type { CaseDetail } from "@/lib/types";

const rupee = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

const FIR_LABEL: Record<string, string> = {
  not_started: "Not started",
  under_review: "Under review",
  registered: "Registered",
  declined: "Not registered",
};

export type CitizenCaseSummary = {
  moneyProtected: string;
  happeningNow: string;
  youNeedToDo: string;
  firStatus: string;
  firNumber: string | null;
};

function hasEvent(detail: CaseDetail, type: string) {
  return detail.events.some((event) => String(event.event_type) === type);
}

function cleanName(value: unknown) {
  const name = String(value || "")
    .replace(/\s*\(simulated\)/i, "")
    .replace(/\s*—.*$/, "")
    .trim();
  return name;
}

function openEvidenceRequest(detail: CaseDetail) {
  return detail.evidenceRequests.find(
    (request) => String(request.status) === "open",
  );
}

function happeningNow(detail: CaseDetail) {
  const status = String(detail.case.case_status || "");
  const ownerType = String(detail.case.current_owner_type || "");
  const owner = cleanName(detail.case.current_owner_name);
  const sla = String(detail.sla.status || "not_applicable");
  const freezeWaiting =
    hasEvent(detail, "FREEZE_REQUEST_CREATED") &&
    (sla === "waiting" || sla === "overdue" || sla === "breached");
  const tracing = Number(detail.case.tracing_amount || 0);

  if (status === "CLOSED") return "Your case has been closed.";
  if (status === "RESOLUTION") return "Your case has been resolved.";
  if (status === "FIR_REGISTERED") return "An FIR has been registered.";
  if (status === "FIR_REVIEW") return "FIR registration is under review.";
  if (status === "INVESTIGATION")
    return "The cyber cell is reviewing the case.";

  if (freezeWaiting) {
    if (ownerType === "bank" && owner)
      return `${owner} is responding to a freeze request.`;
    return "We are waiting for the bank to respond.";
  }
  if (hasEvent(detail, "FREEZE_REQUEST_CREATED")) {
    if (hasEvent(detail, "FUNDS_MOVED") || tracing > 0)
      return "Funds are being traced across another account.";
    return "A freeze request has been sent.";
  }
  if (!hasEvent(detail, "BENEFICIARY_BANK_IDENTIFIED"))
    return "We are identifying the beneficiary bank.";
  if (hasEvent(detail, "FUNDS_MOVED") || tracing > 0)
    return "Funds are being traced across another account.";
  return "We are identifying the beneficiary bank.";
}

function youNeedToDo(detail: CaseDetail, sessionExpired: boolean) {
  const request = openEvidenceRequest(detail);
  if (sessionExpired && request) return "Sign in to attach requested evidence.";
  if (!request) return "Nothing right now.";
  const text =
    `${request.title || ""} ${request.description || ""}`.toLowerCase();
  if (/\breceipt/.test(text))
    return "Upload the requested transaction receipt.";
  if (/reference|utr|\brrn\b/.test(text))
    return "Provide the transaction reference.";
  return "Review the evidence request.";
}

export function buildCitizenCaseSummary(
  detail: CaseDetail,
  input: { sessionExpired?: boolean } = {},
): CitizenCaseSummary {
  const reported = Number(detail.case.reported_amount || 0);
  const secured = Number(detail.case.secured_amount || 0);
  const firStatus = String(detail.fir?.fir_status || "not_started");
  const firNumber = String(detail.fir?.fir_number || "").trim();
  return {
    moneyProtected: `${rupee(secured)} of ${rupee(reported)}`,
    happeningNow: happeningNow(detail),
    youNeedToDo: youNeedToDo(detail, Boolean(input.sessionExpired)),
    firStatus: FIR_LABEL[firStatus] || "Not started",
    firNumber: firNumber || null,
  };
}

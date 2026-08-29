import type { CaseStatus } from "@/lib/types";

const transitions: Record<CaseStatus, readonly CaseStatus[]> = {
  REPORTED: ["FINANCIAL_INTERVENTION", "INVESTIGATION"],
  FINANCIAL_INTERVENTION: [
    "FUNDS_TRACING",
    "PARTIALLY_SECURED",
    "INVESTIGATION",
  ],
  FUNDS_TRACING: ["PARTIALLY_SECURED", "INVESTIGATION"],
  PARTIALLY_SECURED: ["INVESTIGATION", "FIR_REVIEW", "RESOLUTION"],
  INVESTIGATION: ["FIR_REVIEW", "RESOLUTION"],
  FIR_REVIEW: ["FIR_REGISTERED", "RESOLUTION"],
  FIR_REGISTERED: ["RESOLUTION"],
  RESOLUTION: ["CLOSED"],
  CLOSED: [],
};

export function canTransition(from: CaseStatus, to: CaseStatus) {
  return from === to || transitions[from].includes(to);
}

export function assertTransition(from: CaseStatus, to: CaseStatus) {
  if (!canTransition(from, to))
    throw new Error(`Invalid case transition: ${from} → ${to}.`);
}

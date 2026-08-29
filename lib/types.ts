export type Role = "citizen" | "operator";
export type MovementStatus = "secured" | "tracing" | "unrecovered" | "moved" | "withdrawn";
export type CaseStatus = "REPORTED" | "FINANCIAL_INTERVENTION" | "FUNDS_TRACING" | "PARTIALLY_SECURED" | "INVESTIGATION" | "FIR_REVIEW" | "FIR_REGISTERED" | "RESOLUTION" | "CLOSED";
export type Session = { userId: string; role: Role; email: string; displayName: string };
export type CaseDetail = { case: Record<string, unknown>; citizen: Record<string, unknown>; incident: Record<string, unknown>; events: Record<string, unknown>[]; movements: Record<string, unknown>[]; evidence: Record<string, unknown>[]; evidenceRequests: Record<string, unknown>[]; assignments: Record<string, unknown>[]; fir: Record<string, unknown> | undefined; notifications: Record<string, unknown>[]; sla: Record<string, unknown>; audits?: Record<string, unknown>[] };

import type {
  BankAdapter,
  FraudReportingAdapter,
  PoliceAdapter,
} from "./contracts";
const reference = (prefix: string, caseId: string) =>
  `${prefix}-SIM-${caseId.slice(-6)}`;
const syntheticFirNumber = (caseId: string) =>
  caseId === "case-golden"
    ? "SIM-FIR-246/2026"
    : `SIM-FIR-${([...caseId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 900) + 100}/2026`;
/** Deterministic simulation adapters. Replace these bindings with official connectors in production. */
export const simulatedBankAdapter: BankAdapter = {
  async notifyFraud(caseId) {
    return { accepted: true, reference: reference("BANK", caseId) };
  },
  async requestFreeze(caseId) {
    return {
      requestId: reference("FREEZE", caseId),
      accepted: true,
      providerReference: reference("HDFC", caseId),
    };
  },
};
export const simulatedPoliceAdapter: PoliceAdapter = {
  async assignCyberCell(caseId) {
    return { assignmentReference: reference("POLICE", caseId) };
  },
  async startFirReview(caseId) {
    return { reviewReference: reference("REVIEW", caseId) };
  },
  async registerFir(caseId) {
    return { firNumber: syntheticFirNumber(caseId) };
  },
};
export const simulatedReportingAdapter: FraudReportingAdapter = {
  async createExternalComplaint(caseId) {
    return { externalReference: reference("NCRP", caseId) };
  },
};

import type {
  BankAdapter,
  FraudReportingAdapter,
  PoliceAdapter,
} from "./contracts";
import { logEvent } from "@/lib/observability";
const reference = (prefix: string, caseId: string) =>
  `${prefix}-SIM-${caseId.slice(-6)}`;
const syntheticFirNumber = (caseId: string) =>
  caseId === "case-golden"
    ? "SIM-FIR-246/2026"
    : `SIM-FIR-${([...caseId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 900) + 100}/2026`;
/** Deterministic simulation adapters. Replace these bindings with official connectors in production. */
export const simulatedBankAdapter: BankAdapter = {
  async notifyFraud(caseId) {
    logEvent("adapter.bank.notify_fraud", { caseId, adapter: "simulated" });
    return { accepted: true, reference: reference("BANK", caseId) };
  },
  async identifyBeneficiaryBank(caseId, transactionRef) {
    logEvent("adapter.bank.identify_beneficiary", {
      caseId,
      transactionRef,
      adapter: "simulated",
    });
    return {
      institutionId: "inst-hdfc",
      accountRef: "HDFC ••9281",
      reference: reference("BENEFICIARY", caseId),
    };
  },
  async requestFreeze(caseId) {
    logEvent("adapter.bank.request_freeze", { caseId, adapter: "simulated" });
    return {
      requestId: reference("FREEZE", caseId),
      accepted: true,
      providerReference: reference("HDFC", caseId),
    };
  },
};
export const simulatedPoliceAdapter: PoliceAdapter = {
  async assignCyberCell(caseId) {
    logEvent("adapter.police.assign_cyber_cell", {
      caseId,
      adapter: "simulated",
    });
    return { assignmentReference: reference("POLICE", caseId) };
  },
  async startFirReview(caseId) {
    logEvent("adapter.police.start_fir_review", {
      caseId,
      adapter: "simulated",
    });
    return { reviewReference: reference("REVIEW", caseId) };
  },
  async registerFir(caseId) {
    logEvent("adapter.police.register_fir", { caseId, adapter: "simulated" });
    return { firNumber: syntheticFirNumber(caseId) };
  },
};
export const simulatedReportingAdapter: FraudReportingAdapter = {
  async createExternalComplaint(caseId) {
    logEvent("adapter.reporting.create_complaint", {
      caseId,
      adapter: "simulated",
    });
    return { externalReference: reference("NCRP", caseId) };
  },
};

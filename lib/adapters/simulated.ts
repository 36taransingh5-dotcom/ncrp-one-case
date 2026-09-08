import type {
  BankAdapter,
  FraudReportingAdapter,
  NotificationAdapter,
  PoliceAdapter,
} from "./contracts";
import { RetryableIntegrationError } from "./errors";
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
  async requestFreeze(caseId, _accountRef, _amount, context) {
    logEvent("adapter.bank.request_freeze", { caseId, adapter: "simulated" });
    if (context?.demoFreezeRetry && (context.attemptCount || 1) <= 1) {
      throw new RetryableIntegrationError("Sandbox unavailable", 503);
    }
    return {
      requestId: reference("FREEZE", caseId),
      accepted: true,
      providerReference: reference("HDFC", caseId),
    };
  },
  async getFreezeStatus(providerReference) {
    logEvent("adapter.bank.freeze_status", {
      providerReference,
      adapter: "simulated",
    });
    return { status: "completed", securedAmount: 0 };
  },
  async traceFunds(caseId) {
    logEvent("adapter.bank.trace_funds", { caseId, adapter: "simulated" });
    return { traceReference: reference("TRACE", caseId), hops: 1 };
  },
  async reconcile(providerReference) {
    logEvent("adapter.bank.reconcile", {
      providerReference,
      adapter: "simulated",
    });
    return { reconciled: true };
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
  async getStatus(caseId) {
    logEvent("adapter.police.get_status", { caseId, adapter: "simulated" });
    return { status: "registered", firNumber: syntheticFirNumber(caseId) };
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
  async getComplaintStatus(externalReference) {
    logEvent("adapter.reporting.complaint_status", {
      caseId: externalReference,
      adapter: "simulated",
    });
    return { status: "accepted" };
  },
};
export const simulatedNotificationAdapter: NotificationAdapter = {
  async send(input) {
    logEvent("adapter.notification.send", {
      caseId: input.caseReference,
      operation: input.template,
      adapter: "simulated",
    });
    return { messageReference: reference("NOTICE", input.caseReference) };
  },
};

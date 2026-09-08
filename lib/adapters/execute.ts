import {
  getBankAdapter,
  getPoliceAdapter,
  getProviderBinding,
  getReportingAdapter,
} from "@/lib/adapters";
import { getIntegrationTimeoutMs } from "@/lib/adapters/config";
import type { IntegrationProvider } from "@/lib/adapters/config";

export type IntegrationJobInput = {
  case_id: string;
  provider: string;
  action: string;
  payload_json: Record<string, unknown>;
  idempotency_key: string;
  attempt_count?: number;
};

function asProvider(value: string): IntegrationProvider {
  if (
    value === "bank" ||
    value === "police" ||
    value === "reporting" ||
    value === "notification"
  )
    return value;
  throw new Error(`Unsupported integration provider: ${value}`);
}

export function externalReferenceFromResult(result: Record<string, unknown>) {
  return String(
    result.providerReference ||
      result.assignmentReference ||
      result.reviewReference ||
      result.firNumber ||
      result.externalReference ||
      result.reference ||
      result.messageReference ||
      result.traceReference ||
      result.requestId ||
      "",
  );
}

export async function executeIntegrationAction(job: IntegrationJobInput) {
  const provider = asProvider(job.provider);
  const context = {
    idempotencyKey: job.idempotency_key,
    timeoutMs: getIntegrationTimeoutMs(),
    attemptCount:
      job.attempt_count && job.attempt_count > 0 ? job.attempt_count : 1,
    demoFreezeRetry: Boolean(job.payload_json?.demonstrateRetry),
  };
  const caseId = job.case_id;
  const payload = job.payload_json;
  let result: Record<string, unknown>;

  if (provider === "bank" && job.action === "notify_fraud") {
    result = await getBankAdapter().notifyFraud(
      caseId,
      String(payload.transactionId || payload.transactionRef || caseId),
      context,
    );
  } else if (provider === "bank" && job.action === "identify_beneficiary") {
    result = await getBankAdapter().identifyBeneficiaryBank(
      caseId,
      String(payload.transactionRef || payload.transactionId || caseId),
      context,
    );
  } else if (provider === "bank" && job.action === "request_freeze") {
    const bank = getBankAdapter();
    const freeze = await bank.requestFreeze(
      caseId,
      String(payload.accountRef || "Beneficiary account (masked)"),
      Number(payload.amount || 0),
      context,
    );
    let freezeStatus: string | undefined;
    let securedAmount: number | undefined;
    try {
      const status = await bank.getFreezeStatus(freeze.providerReference, {
        ...context,
        idempotencyKey: `${job.idempotency_key}:status`,
      });
      freezeStatus = status.status;
      securedAmount = status.securedAmount;
    } catch {
      freezeStatus = undefined;
    }
    result = { ...freeze, freezeStatus, securedAmount };
  } else if (provider === "bank" && job.action === "trace_funds") {
    result = await getBankAdapter().traceFunds(
      caseId,
      String(payload.transactionRef || payload.transactionId || caseId),
      context,
    );
  } else if (provider === "police" && job.action === "assign_cyber_cell") {
    result = await getPoliceAdapter().assignCyberCell(caseId, context);
  } else if (provider === "police" && job.action === "start_fir_review") {
    result = await getPoliceAdapter().startFirReview(caseId, context);
  } else if (provider === "police" && job.action === "register_fir") {
    result = await getPoliceAdapter().registerFir(caseId, context);
  } else if (provider === "police" && job.action === "get_status") {
    result = await getPoliceAdapter().getStatus(caseId, context);
  } else if (
    provider === "reporting" &&
    job.action === "create_external_complaint"
  ) {
    result = await getReportingAdapter().createExternalComplaint(
      caseId,
      context,
    );
  } else if (
    provider === "reporting" &&
    job.action === "get_complaint_status"
  ) {
    result = await getReportingAdapter().getComplaintStatus(
      String(payload.externalReference || payload.reference || caseId),
      context,
    );
  } else {
    throw new Error(
      `Unsupported integration job: ${job.provider}.${job.action}`,
    );
  }

  return {
    result,
    externalReference:
      externalReferenceFromResult(result) || "INTEGRATION-COMPLETE",
    binding: getProviderBinding(provider),
  };
}

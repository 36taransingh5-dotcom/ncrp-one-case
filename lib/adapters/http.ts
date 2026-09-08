import type {
  BankAdapter,
  FraudReportingAdapter,
  NotificationAdapter,
  PoliceAdapter,
} from "./contracts";
import type { IntegrationProvider } from "./config";
import {
  getAppBaseUrl,
  getProviderApiKey,
  getProviderBaseUrl,
  getWebhookSecret,
} from "./config";
import { PermanentIntegrationError } from "./errors";
import { integrationFetch } from "./http-client";
import { logEvent } from "@/lib/observability";

export type HttpBinding = { baseUrl: string; apiKey: string };

function requireBinding(
  provider: IntegrationProvider,
  override?: HttpBinding,
): HttpBinding {
  if (override) return override;
  const baseUrl = getProviderBaseUrl(provider);
  const apiKey = getProviderApiKey(provider);
  if (!baseUrl || !apiKey)
    throw new PermanentIntegrationError(
      `${provider} HTTP adapter is not configured`,
    );
  return { baseUrl, apiKey };
}

function contextTimeout(timeoutMs?: number) {
  return timeoutMs && timeoutMs > 0 ? timeoutMs : 8_000;
}

function callbackFields() {
  if (!getWebhookSecret()) return {};
  return { callbackUrl: `${getAppBaseUrl()}/api/integrations/webhook` };
}

export function createHttpBankAdapter(override?: HttpBinding): BankAdapter {
  return {
    async notifyFraud(caseId, transactionId, context) {
      const binding = requireBinding("bank", override);
      logEvent("adapter.bank.notify_fraud", { caseId, adapter: "http" });
      return integrationFetch({
        ...binding,
        provider: "bank",
        path: "/v1/fraud-notifications",
        idempotencyKey: context?.idempotencyKey || `bank:notify:${caseId}`,
        timeoutMs: contextTimeout(context?.timeoutMs),
        body: { caseId, transactionId, ...callbackFields() },
      });
    },
    async identifyBeneficiaryBank(caseId, transactionRef, context) {
      const binding = requireBinding("bank", override);
      logEvent("adapter.bank.identify_beneficiary", {
        caseId,
        adapter: "http",
      });
      return integrationFetch({
        ...binding,
        provider: "bank",
        path: "/v1/beneficiary-lookup",
        idempotencyKey: context?.idempotencyKey || `bank:identify:${caseId}`,
        timeoutMs: contextTimeout(context?.timeoutMs),
        body: { caseId, transactionRef, ...callbackFields() },
      });
    },
    async requestFreeze(caseId, accountRef, amount, context) {
      const binding = requireBinding("bank", override);
      logEvent("adapter.bank.request_freeze", { caseId, adapter: "http" });
      return integrationFetch({
        ...binding,
        provider: "bank",
        path: "/v1/freeze-requests",
        idempotencyKey: context?.idempotencyKey || `bank:freeze:${caseId}`,
        timeoutMs: contextTimeout(context?.timeoutMs),
        body: { caseId, accountRef, amount, ...callbackFields() },
      });
    },
    async traceFunds(caseId, transactionRef, context) {
      const binding = requireBinding("bank", override);
      logEvent("adapter.bank.trace_funds", { caseId, adapter: "http" });
      return integrationFetch({
        ...binding,
        provider: "bank",
        path: "/v1/fund-traces",
        idempotencyKey: context?.idempotencyKey || `bank:trace:${caseId}`,
        timeoutMs: contextTimeout(context?.timeoutMs),
        body: { caseId, transactionRef, ...callbackFields() },
      });
    },
    async getFreezeStatus(providerReference, context) {
      const binding = requireBinding("bank", override);
      logEvent("adapter.bank.freeze_status", {
        providerReference,
        adapter: "http",
      });
      return integrationFetch({
        ...binding,
        provider: "bank",
        method: "GET",
        path: `/v1/freeze-requests/${encodeURIComponent(providerReference)}`,
        idempotencyKey:
          context?.idempotencyKey || `bank:status:${providerReference}`,
        timeoutMs: contextTimeout(context?.timeoutMs),
      });
    },
    async reconcile(providerReference, context) {
      const binding = requireBinding("bank", override);
      logEvent("adapter.bank.reconcile", {
        providerReference,
        adapter: "http",
      });
      return integrationFetch({
        ...binding,
        provider: "bank",
        path: `/v1/freeze-requests/${encodeURIComponent(providerReference)}/reconcile`,
        idempotencyKey:
          context?.idempotencyKey || `bank:reconcile:${providerReference}`,
        timeoutMs: contextTimeout(context?.timeoutMs),
        body: { providerReference, ...callbackFields() },
      });
    },
  };
}

export function createHttpPoliceAdapter(override?: HttpBinding): PoliceAdapter {
  return {
    async assignCyberCell(caseId, context) {
      const binding = requireBinding("police", override);
      logEvent("adapter.police.assign_cyber_cell", {
        caseId,
        adapter: "http",
      });
      return integrationFetch({
        ...binding,
        provider: "police",
        path: "/v1/assignments",
        idempotencyKey: context?.idempotencyKey || `police:assign:${caseId}`,
        timeoutMs: contextTimeout(context?.timeoutMs),
        body: { caseId, ...callbackFields() },
      });
    },
    async startFirReview(caseId, context) {
      const binding = requireBinding("police", override);
      logEvent("adapter.police.start_fir_review", {
        caseId,
        adapter: "http",
      });
      return integrationFetch({
        ...binding,
        provider: "police",
        path: "/v1/fir-reviews",
        idempotencyKey: context?.idempotencyKey || `police:review:${caseId}`,
        timeoutMs: contextTimeout(context?.timeoutMs),
        body: { caseId, ...callbackFields() },
      });
    },
    async registerFir(caseId, context) {
      const binding = requireBinding("police", override);
      logEvent("adapter.police.register_fir", { caseId, adapter: "http" });
      return integrationFetch({
        ...binding,
        provider: "police",
        path: "/v1/firs",
        idempotencyKey: context?.idempotencyKey || `police:fir:${caseId}`,
        timeoutMs: contextTimeout(context?.timeoutMs),
        body: { caseId, ...callbackFields() },
      });
    },
    async getStatus(caseId, context) {
      const binding = requireBinding("police", override);
      logEvent("adapter.police.get_status", { caseId, adapter: "http" });
      return integrationFetch({
        ...binding,
        provider: "police",
        method: "GET",
        path: `/v1/cases/${encodeURIComponent(caseId)}`,
        idempotencyKey: context?.idempotencyKey || `police:status:${caseId}`,
        timeoutMs: contextTimeout(context?.timeoutMs),
      });
    },
  };
}

export function createHttpReportingAdapter(
  override?: HttpBinding,
): FraudReportingAdapter {
  return {
    async createExternalComplaint(caseId, context) {
      const binding = requireBinding("reporting", override);
      logEvent("adapter.reporting.create_complaint", {
        caseId,
        adapter: "http",
      });
      return integrationFetch({
        ...binding,
        provider: "reporting",
        path: "/v1/complaints",
        idempotencyKey: context?.idempotencyKey || `reporting:${caseId}`,
        timeoutMs: contextTimeout(context?.timeoutMs),
        body: { caseId, ...callbackFields() },
      });
    },
    async getComplaintStatus(externalReference, context) {
      const binding = requireBinding("reporting", override);
      logEvent("adapter.reporting.complaint_status", {
        caseId: externalReference,
        adapter: "http",
      });
      return integrationFetch({
        ...binding,
        provider: "reporting",
        method: "GET",
        path: `/v1/complaints/${encodeURIComponent(externalReference)}`,
        idempotencyKey:
          context?.idempotencyKey || `reporting:status:${externalReference}`,
        timeoutMs: contextTimeout(context?.timeoutMs),
      });
    },
  };
}

export function createHttpNotificationAdapter(
  override?: HttpBinding,
): NotificationAdapter {
  return {
    async send(input, context) {
      const binding = requireBinding("notification", override);
      logEvent("adapter.notification.send", {
        caseId: input.caseReference,
        operation: input.template,
        adapter: "http",
      });
      return integrationFetch({
        ...binding,
        provider: "notification",
        path: "/v1/messages",
        idempotencyKey:
          context?.idempotencyKey ||
          `notice:${input.caseReference}:${input.template}`,
        timeoutMs: contextTimeout(context?.timeoutMs),
        body: {
          recipient: input.recipient,
          template: input.template,
          caseReference: input.caseReference,
        },
      });
    },
  };
}

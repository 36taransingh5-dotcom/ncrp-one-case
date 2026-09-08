import type {
  BankAdapter,
  FraudReportingAdapter,
  NotificationAdapter,
  PoliceAdapter,
} from "./contracts";
import { getProviderBinding } from "./config";
import {
  createHttpBankAdapter,
  createHttpNotificationAdapter,
  createHttpPoliceAdapter,
  createHttpReportingAdapter,
} from "./http";
import {
  simulatedBankAdapter,
  simulatedNotificationAdapter,
  simulatedPoliceAdapter,
  simulatedReportingAdapter,
} from "./simulated";

export {
  getIntegrationMode,
  getIntegrationSnapshot,
  getProviderBinding,
  integrationUsesHttp,
} from "./config";
export type { IntegrationMode, ProviderBinding } from "./config";
export {
  IntegrationError,
  PermanentIntegrationError,
  RetryableIntegrationError,
  isPermanentIntegrationError,
  isRetryableIntegrationError,
} from "./errors";

export function getBankAdapter(): BankAdapter {
  return getProviderBinding("bank") === "http"
    ? createHttpBankAdapter()
    : simulatedBankAdapter;
}

export function getPoliceAdapter(): PoliceAdapter {
  return getProviderBinding("police") === "http"
    ? createHttpPoliceAdapter()
    : simulatedPoliceAdapter;
}

export function getReportingAdapter(): FraudReportingAdapter {
  return getProviderBinding("reporting") === "http"
    ? createHttpReportingAdapter()
    : simulatedReportingAdapter;
}

export function getNotificationAdapter(): NotificationAdapter {
  return getProviderBinding("notification") === "http"
    ? createHttpNotificationAdapter()
    : simulatedNotificationAdapter;
}

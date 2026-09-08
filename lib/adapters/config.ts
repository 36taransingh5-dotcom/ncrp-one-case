export type IntegrationMode = "simulated" | "http";
export type IntegrationProvider =
  "bank" | "police" | "reporting" | "notification";
export type ProviderBinding = "simulated" | "http" | "resend";
export type NotificationProvider = "simulated" | "http" | "resend";
export type StatusLabel =
  | "LIVE"
  | "SANDBOX"
  | "SIMULATED"
  | "NOT CONNECTED"
  | "NOT CONFIGURED"
  | "DEGRADED";

const PROVIDER_URL_ENV: Record<IntegrationProvider, string> = {
  bank: "NCRP_BANK_API_BASE_URL",
  police: "NCRP_POLICE_API_BASE_URL",
  reporting: "NCRP_REPORTING_API_BASE_URL",
  notification: "NCRP_NOTIFICATION_API_BASE_URL",
};

const PROVIDER_KEY_ENV: Record<IntegrationProvider, string> = {
  bank: "NCRP_BANK_API_KEY",
  police: "NCRP_POLICE_API_KEY",
  reporting: "NCRP_REPORTING_API_KEY",
  notification: "NCRP_NOTIFICATION_API_KEY",
};

const PROVIDER_MODE_ENV: Record<IntegrationProvider, string> = {
  bank: "BANK_INTEGRATION_MODE",
  police: "POLICE_INTEGRATION_MODE",
  reporting: "REPORTING_INTEGRATION_MODE",
  notification: "NCRP_NOTIFICATION_MODE",
};

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export function resolveIntegrationMode(
  explicitMode: string,
  backend: string,
  hasSandboxSecret: boolean,
): IntegrationMode {
  if (explicitMode === "http" || explicitMode === "simulated")
    return explicitMode;
  if (backend === "supabase" && hasSandboxSecret) return "http";
  return "simulated";
}

export function getIntegrationMode(): IntegrationMode {
  return resolveIntegrationMode(
    env("NCRP_INTEGRATION_MODE"),
    env("NCRP_BACKEND"),
    Boolean(getSandboxSecret()),
  );
}

export function getIntegrationTimeoutMs() {
  const parsed = Number(env("NCRP_INTEGRATION_TIMEOUT_MS") || "8000");
  if (!Number.isFinite(parsed)) return 8_000;
  return Math.min(25_000, Math.max(1_000, Math.trunc(parsed)));
}

export function getWebhookSecret() {
  return (
    env("NCRP_WEBHOOK_SECRET") ||
    env("NCRP_SANDBOX_SECRET") ||
    env("NCRP_WORKER_SECRET")
  );
}

export function getSandboxSecret() {
  return (
    env("NCRP_SANDBOX_SECRET") ||
    env("NCRP_WORKER_SECRET") ||
    env("CRON_SECRET")
  );
}

export function getAppBaseUrl() {
  const configured = env("NCRP_APP_BASE_URL").replace(/\/$/, "");
  if (configured) return configured;
  const vercel = env("VERCEL_URL");
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

export function getProviderApiKey(provider: IntegrationProvider) {
  return env(PROVIDER_KEY_ENV[provider]) || getSandboxSecret();
}

export function getProviderBaseUrl(provider: IntegrationProvider) {
  const configured = env(PROVIDER_URL_ENV[provider]).replace(/\/$/, "");
  if (configured) return configured;
  if (getIntegrationMode() !== "http") return "";
  if (!getProviderApiKey(provider)) return "";
  return `${getAppBaseUrl()}/api/integrations/sandbox/${provider}`;
}

export function resolveProviderBinding(
  mode: IntegrationMode,
  baseUrl: string,
  apiKey: string,
): Exclude<ProviderBinding, "resend"> {
  if (mode !== "http") return "simulated";
  return baseUrl && apiKey ? "http" : "simulated";
}

function providerModeOverride(
  provider: IntegrationProvider,
): IntegrationMode | "" {
  const value = env(PROVIDER_MODE_ENV[provider]).toLowerCase();
  if (value === "simulated") return "simulated";
  if (value === "http" || value === "sandbox") return "http";
  return "";
}

export function getProviderBinding(
  provider: IntegrationProvider,
): Exclude<ProviderBinding, "resend"> {
  const override = providerModeOverride(provider);
  return resolveProviderBinding(
    override || getIntegrationMode(),
    getProviderBaseUrl(provider),
    getProviderApiKey(provider),
  );
}

export function resendConfigured() {
  return Boolean(env("RESEND_API_KEY") && env("RESEND_FROM"));
}

export function getNotificationProvider(): NotificationProvider {
  const explicit = env("NCRP_NOTIFICATION_MODE").toLowerCase();
  if (explicit === "simulated") return "simulated";
  if (explicit === "resend") return resendConfigured() ? "resend" : "simulated";
  if (explicit === "http") return getProviderBinding("notification");
  if (resendConfigured()) return "resend";
  return getProviderBinding("notification");
}

export function getIntegrationSnapshot() {
  return {
    mode: getIntegrationMode(),
    notification: getNotificationProvider(),
    providers: {
      bank: getProviderBinding("bank"),
      police: getProviderBinding("police"),
      reporting: getProviderBinding("reporting"),
      notification: getNotificationProvider(),
    },
  };
}

export function integrationUsesHttp() {
  const snapshot = getIntegrationSnapshot();
  return Object.values(snapshot.providers).some(
    (binding) => binding === "http",
  );
}

export function adapterStatusLabel(
  provider: Exclude<IntegrationProvider, "notification">,
): StatusLabel {
  const binding = getProviderBinding(provider);
  if (binding !== "http") return "SIMULATED";
  const baseUrl = getProviderBaseUrl(provider);
  if (baseUrl.includes("/api/integrations/sandbox/")) return "SANDBOX";
  return "SANDBOX";
}

export function resendRequestedWithoutConfig() {
  return (
    env("NCRP_NOTIFICATION_MODE").toLowerCase() === "resend" &&
    !resendConfigured()
  );
}

export function notificationStatusLabel(): StatusLabel {
  const explicit = env("NCRP_NOTIFICATION_MODE").toLowerCase();
  if (explicit === "resend" && !resendConfigured()) return "NOT CONFIGURED";
  const provider = getNotificationProvider();
  if (provider === "resend") return "LIVE";
  if (provider === "http") return "SANDBOX";
  if (explicit === "resend") return "NOT CONFIGURED";
  return "SIMULATED";
}

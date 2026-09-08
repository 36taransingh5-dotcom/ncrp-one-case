export type IntegrationMode = "simulated" | "http";
export type IntegrationProvider =
  "bank" | "police" | "reporting" | "notification";
export type ProviderBinding = "simulated" | "http";

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
): ProviderBinding {
  if (mode !== "http") return "simulated";
  return baseUrl && apiKey ? "http" : "simulated";
}

export function getProviderBinding(
  provider: IntegrationProvider,
): ProviderBinding {
  return resolveProviderBinding(
    getIntegrationMode(),
    getProviderBaseUrl(provider),
    getProviderApiKey(provider),
  );
}

export function getIntegrationSnapshot() {
  return {
    mode: getIntegrationMode(),
    providers: {
      bank: getProviderBinding("bank"),
      police: getProviderBinding("police"),
      reporting: getProviderBinding("reporting"),
      notification: getProviderBinding("notification"),
    },
  };
}

export function integrationUsesHttp() {
  const snapshot = getIntegrationSnapshot();
  return Object.values(snapshot.providers).some(
    (binding) => binding === "http",
  );
}

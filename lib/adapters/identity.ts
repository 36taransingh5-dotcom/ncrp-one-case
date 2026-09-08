import crypto from "node:crypto";
import { getAppBaseUrl } from "./config";
import { PermanentIntegrationError, RetryableIntegrationError } from "./errors";

export type DigiLockerMode = "disabled" | "sandbox" | "live";
export type ApiSetuMode = "disabled" | "sandbox" | "live";

export type DigiLockerIssuedDocument = {
  name: string;
  uri: string;
  mime: string;
  description: string;
  issuer: string;
  doctype: string;
};

export type DigiLockerToken = {
  accessToken: string;
  expiresAt: number;
};

const LIVE_BASE = "https://digilocker.meripehchaan.gov.in";
const STATE_TTL_MS = 10 * 60_000;
export const DIGILOCKER_PKCE_COOKIE = "ncrp_dl_pkce";
export const DIGILOCKER_TOKEN_COOKIE = "ncrp_dl_token";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function signingSecret() {
  return (
    env("NCRP_SESSION_SECRET") ||
    env("NCRP_WORKER_SECRET") ||
    "local-development-only-change-me"
  );
}

export function digiLockerClientId() {
  return env("DIGILOCKER_CLIENT_ID") || env("API_SETU_CLIENT_ID");
}

export function digiLockerClientSecret() {
  return env("DIGILOCKER_CLIENT_SECRET") || env("API_SETU_CLIENT_SECRET");
}

export function resolveIdentityMode(
  explicitMode: string,
  clientId: string,
  clientSecret: string,
): DigiLockerMode {
  const mode = explicitMode.trim().toLowerCase();
  if (mode === "disabled") return "disabled";
  if (!clientId || !clientSecret) return "disabled";
  if (mode === "live") return "live";
  return "sandbox";
}

export function getDigiLockerMode(): DigiLockerMode {
  return resolveIdentityMode(
    env("DIGILOCKER_MODE"),
    digiLockerClientId(),
    digiLockerClientSecret(),
  );
}

export function getApiSetuMode(): ApiSetuMode {
  return resolveIdentityMode(
    env("API_SETU_MODE"),
    env("API_SETU_CLIENT_ID"),
    env("API_SETU_CLIENT_SECRET"),
  );
}

export function getDigiLockerBaseUrl() {
  const configured = env("DIGILOCKER_BASE_URL").replace(/\/$/, "");
  if (configured) return configured;
  return LIVE_BASE;
}

export function getDigiLockerRedirectUri() {
  const configured = env("DIGILOCKER_REDIRECT_URI");
  if (configured) return configured;
  return `${getAppBaseUrl()}/api/integrations/digilocker/callback`;
}

export function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

export function signOauthState(payload: {
  userId: string;
  caseId: string;
  nonce: string;
  exp?: number;
}) {
  const body = Buffer.from(
    JSON.stringify({
      userId: payload.userId,
      caseId: payload.caseId,
      nonce: payload.nonce,
      exp: payload.exp || Date.now() + STATE_TTL_MS,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", signingSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function verifyOauthState(state: string) {
  const [body, signature] = state.split(".");
  if (!body || !signature) return null;
  const expected = crypto
    .createHmac("sha256", signingSecret())
    .update(body)
    .digest("base64url");
  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  )
    return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as {
      userId: string;
      caseId: string;
      nonce: string;
      exp: number;
    };
    if (!parsed.userId || !parsed.caseId || parsed.exp < Date.now())
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function encryptSecret(value: string) {
  const key = crypto.createHash("sha256").update(signingSecret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptSecret(value: string) {
  const raw = Buffer.from(value, "base64url");
  if (raw.length < 29) throw new PermanentIntegrationError("Invalid session");
  const key = crypto.createHash("sha256").update(signingSecret()).digest();
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

export function parseDigiLockerTokenCookie(
  value: string | undefined,
  userId: string,
  caseId: string,
) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decryptSecret(value)) as {
      accessToken?: string;
      expiresAt?: number;
      userId?: string;
      caseId?: string;
    };
    if (
      !parsed.accessToken ||
      parsed.userId !== userId ||
      parsed.caseId !== caseId ||
      !parsed.expiresAt ||
      parsed.expiresAt < Date.now() + 5_000
    )
      return null;
    return parsed.accessToken;
  } catch {
    return null;
  }
}

export function buildDigiLockerAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  baseUrl?: string;
}) {
  const url = new URL(
    `${(input.baseUrl || LIVE_BASE).replace(/\/$/, "")}/public/oauth2/1/authorize`,
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("dl_flow", "signin");
  return url.toString();
}

function classifyHttp(status: number, detail: string) {
  if (status === 401)
    throw new PermanentIntegrationError(
      detail || "DigiLocker authorization expired",
    );
  if (status >= 500 || status === 429)
    throw new RetryableIntegrationError(detail || "DigiLocker is unavailable");
  throw new PermanentIntegrationError(
    detail || `DigiLocker returned HTTP ${status}`,
  );
}

async function digiLockerFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
) {
  const timeoutMs =
    init.timeoutMs && init.timeoutMs > 0 ? init.timeoutMs : 12_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${getDigiLockerBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("abort"));
    throw new RetryableIntegrationError(
      aborted ? "DigiLocker timed out" : "DigiLocker request failed",
    );
  } finally {
    clearTimeout(timer);
  }
}

export interface DigiLockerAdapter {
  isEnabled(): boolean;
  authorizationUrl(state: string, codeChallenge: string): string | null;
  exchangeCode(code: string, codeVerifier: string): Promise<DigiLockerToken>;
  listIssuedDocuments(accessToken: string): Promise<DigiLockerIssuedDocument[]>;
  downloadFile(
    accessToken: string,
    uri: string,
  ): Promise<{ bytes: Buffer; contentType: string }>;
}

export interface ApiSetuAdapter {
  isEnabled(): boolean;
}

export const disabledDigiLockerAdapter: DigiLockerAdapter = {
  isEnabled() {
    return false;
  },
  authorizationUrl() {
    return null;
  },
  async exchangeCode() {
    throw new PermanentIntegrationError("DigiLocker is not configured");
  },
  async listIssuedDocuments() {
    throw new PermanentIntegrationError("DigiLocker is not configured");
  },
  async downloadFile() {
    throw new PermanentIntegrationError("DigiLocker is not configured");
  },
};

export const disabledApiSetuAdapter: ApiSetuAdapter = {
  isEnabled() {
    return false;
  },
};

function parseMime(value: unknown) {
  if (typeof value === "string" && value.trim())
    return value.trim().toLowerCase();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim())
        return item.trim().toLowerCase();
      if (item && typeof item === "object") {
        const first = Object.values(item as Record<string, unknown>)[0];
        if (typeof first === "string") return first.toLowerCase();
      }
    }
  }
  return "application/pdf";
}

export function createDigiLockerAdapter(): DigiLockerAdapter {
  const clientId = digiLockerClientId();
  const clientSecret = digiLockerClientSecret();
  const redirectUri = getDigiLockerRedirectUri();
  if (!clientId || !clientSecret) return disabledDigiLockerAdapter;
  return {
    isEnabled() {
      return true;
    },
    authorizationUrl(state, codeChallenge) {
      return buildDigiLockerAuthorizationUrl({
        clientId,
        redirectUri,
        state,
        codeChallenge,
        baseUrl: getDigiLockerBaseUrl(),
      });
    },
    async exchangeCode(code, codeVerifier) {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier,
      });
      const response = await digiLockerFetch("/public/oauth2/2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        access_token?: string;
        expires_in?: number;
        error_description?: string;
        error?: string;
      };
      if (!response.ok)
        classifyHttp(
          response.status,
          payload.error_description || payload.error || "",
        );
      const accessToken = payload.access_token?.trim();
      if (!accessToken)
        throw new RetryableIntegrationError(
          "DigiLocker returned no access token",
        );
      const expiresIn = Number(payload.expires_in || 3600);
      return {
        accessToken,
        expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
      };
    },
    async listIssuedDocuments(accessToken) {
      const response = await digiLockerFetch("/public/oauth2/2/files/issued", {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        items?: Array<Record<string, unknown>>;
        error_description?: string;
        error?: string;
      };
      if (!response.ok)
        classifyHttp(
          response.status,
          payload.error_description || payload.error || "",
        );
      return (payload.items || [])
        .map((item) => ({
          name: String(item.name || item.description || "DigiLocker document"),
          uri: String(item.uri || ""),
          mime: parseMime(item.mime),
          description: String(item.description || item.name || ""),
          issuer: String(item.issuer || ""),
          doctype: String(item.doctype || ""),
        }))
        .filter((item) => item.uri);
    },
    async downloadFile(accessToken, uri) {
      const response = await digiLockerFetch(
        `/public/oauth2/1/file/${encodeURIComponent(uri)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error_description?: string;
          error?: string;
        };
        classifyHttp(
          response.status,
          payload.error_description || payload.error || "",
        );
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const contentType = (
        response.headers.get("content-type") || "application/pdf"
      )
        .split(";")[0]
        .trim()
        .toLowerCase();
      return { bytes, contentType };
    },
  };
}

export function createApiSetuAdapter(): ApiSetuAdapter {
  return {
    isEnabled() {
      return getApiSetuMode() !== "disabled";
    },
  };
}

export function getDigiLockerAdapter(): DigiLockerAdapter {
  return getDigiLockerMode() === "disabled"
    ? disabledDigiLockerAdapter
    : createDigiLockerAdapter();
}

export function getApiSetuAdapter(): ApiSetuAdapter {
  return getApiSetuMode() === "disabled"
    ? disabledApiSetuAdapter
    : createApiSetuAdapter();
}

export function getIdentitySnapshot() {
  return {
    digilocker: getDigiLockerMode(),
    apisetu: getApiSetuMode(),
  };
}

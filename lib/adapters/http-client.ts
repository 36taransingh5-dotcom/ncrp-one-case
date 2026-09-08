import { PermanentIntegrationError, RetryableIntegrationError } from "./errors";
import { logEvent, logFailure } from "@/lib/observability";

export type JsonObject = Record<string, unknown>;

type RequestOptions = {
  method?: "GET" | "POST";
  path: string;
  body?: JsonObject;
  idempotencyKey: string;
  timeoutMs: number;
  apiKey: string;
  baseUrl: string;
  provider: string;
};

function joinUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

function classifyStatus(status: number, message: string) {
  if (status === 408 || status === 409 || status === 425 || status === 429)
    return new RetryableIntegrationError(message, status);
  if (status >= 500) return new RetryableIntegrationError(message, status);
  return new PermanentIntegrationError(message, status);
}

export async function integrationFetch<T>(options: RequestOptions): Promise<T> {
  const url = joinUrl(options.baseUrl, options.path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: options.method || "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
        "Idempotency-Key": options.idempotencyKey,
      },
      body:
        (options.method || "POST") === "GET"
          ? undefined
          : JSON.stringify(options.body || {}),
    });
    const durationMs = Date.now() - started;
    logEvent("adapter.http.response", {
      provider: options.provider,
      operation: options.path,
      outcome: response.ok ? "success" : "failure",
      status: response.status,
      durationMs,
    });
    if (!response.ok) {
      throw classifyStatus(
        response.status,
        `${options.provider} returned HTTP ${response.status}`,
      );
    }
    if (response.status === 204) return {} as T;
    const payload = (await response.json()) as T;
    return payload;
  } catch (error) {
    if (error instanceof PermanentIntegrationError) throw error;
    if (error instanceof RetryableIntegrationError) throw error;
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("abort"));
    logFailure("adapter.http.failed", error, {
      provider: options.provider,
      operation: options.path,
    });
    throw new RetryableIntegrationError(
      aborted
        ? `${options.provider} request timed out`
        : `${options.provider} request failed`,
      aborted ? 408 : undefined,
      error,
    );
  } finally {
    clearTimeout(timer);
  }
}

export const BANK_RETRY_QUEUED = "Bank temporarily unavailable — retry queued";
export const BANK_ACKNOWLEDGED = "Bank acknowledgement received";

export function isDemoFreezeRetry(
  payload: Record<string, unknown> | undefined,
) {
  return payload?.demonstrateRetry === true;
}

export function sandboxFreezeRetryShouldFail(input: {
  path: string;
  method: string;
  demo?: string | null;
  attempt?: string | null;
}) {
  if (input.demo !== "freeze-retry-once") return false;
  if (input.method !== "POST") return false;
  if (input.path !== "v1/freeze-requests") return false;
  const attempt = Number(input.attempt || "1");
  return !Number.isFinite(attempt) || attempt <= 1;
}

export function sanitizeJobError(
  error: unknown,
  options: { retrying: boolean; freeze: boolean },
) {
  if (options.freeze && options.retrying) return BANK_RETRY_QUEUED;
  const message =
    error instanceof Error ? error.message : String(error || "Unknown error");
  if (/HTTP 503|\b503\b/i.test(message)) {
    return options.retrying
      ? BANK_RETRY_QUEUED
      : "The bank request could not be completed.";
  }
  return message.slice(0, 500);
}

export function isFreezeJob(job: { action?: unknown }) {
  return /freeze/.test(String(job.action || ""));
}

export function freezeRetryIsQueued(job: {
  action?: unknown;
  status?: unknown;
}) {
  const status = String(job.status || "");
  return isFreezeJob(job) && (status === "retrying" || status === "pending");
}

export function freezeJobStatusLabel(job: {
  action?: unknown;
  status?: unknown;
  last_error?: unknown;
}) {
  const status = String(job.status || "");
  if (freezeRetryIsQueued(job) && (job.last_error || status === "retrying"))
    return BANK_RETRY_QUEUED;
  if (isFreezeJob(job) && (status === "succeeded" || status === "completed"))
    return BANK_ACKNOWLEDGED;
  return null;
}

export function retryDelayMs(input: {
  attemptCount: number;
  demoFreezeRetry: boolean;
}) {
  if (input.demoFreezeRetry) return 0;
  return Math.min(30, 2 ** Math.max(0, input.attemptCount - 1)) * 60_000;
}

export function freezeAckNotification() {
  return {
    title: BANK_ACKNOWLEDGED,
    body: "The bank confirmed it received the freeze request. Your case is still open — you do not need to start over.",
  };
}

export function jobCompletionLabel(job: {
  provider?: unknown;
  action?: unknown;
}) {
  if (
    String(job.provider) === "bank" &&
    /freeze/.test(String(job.action || ""))
  )
    return BANK_ACKNOWLEDGED;
  return "External response received";
}

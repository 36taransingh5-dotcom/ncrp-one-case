export type SlaTimingStatus = "waiting" | "overdue" | "met" | "breached";

export function calculateSlaTiming(input: {
  requestedAt: string;
  respondedAt?: string;
  breachedAt?: string;
  thresholdMs?: number;
  nowMs?: number;
}) {
  const thresholdMs = input.thresholdMs ?? 2 * 60 * 60 * 1000;
  const deadlineAt = new Date(
    new Date(input.requestedAt).getTime() + thresholdMs,
  ).toISOString();
  const deadlineMs = new Date(deadlineAt).getTime();
  const status: SlaTimingStatus = input.breachedAt
    ? "breached"
    : input.respondedAt
      ? new Date(input.respondedAt).getTime() <= deadlineMs
        ? "met"
        : "overdue"
      : (input.nowMs ?? Date.now()) > deadlineMs
        ? "overdue"
        : "waiting";
  return {
    status,
    deadlineAt,
    remainingMs: deadlineMs - (input.nowMs ?? Date.now()),
  };
}

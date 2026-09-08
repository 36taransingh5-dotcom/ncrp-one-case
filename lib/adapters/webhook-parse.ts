import { z } from "zod";
import { getWebhookSecret } from "./config";
import { PermanentIntegrationError } from "./errors";
import { verifyWebhookSignature } from "./signature";

export const webhookEventSchema = z.object({
  eventId: z.string().min(8).max(120),
  eventType: z.enum([
    "freeze.acknowledged",
    "freeze.completed",
    "fir.registered",
    "job.updated",
  ]),
  provider: z.enum(["bank", "police", "reporting", "notification"]),
  caseId: z.string().min(8).max(80).optional(),
  publicCaseId: z
    .string()
    .regex(/^NCRP-\d{2}-\d{6}$/)
    .optional(),
  jobId: z.string().uuid().optional(),
  providerReference: z.string().min(3).max(120).optional(),
  status: z.string().min(2).max(40).optional(),
  securedAmount: z.number().int().nonnegative().optional(),
  occurredAt: z.string().min(10).max(40).optional(),
  timestamp: z.string().min(10).max(40).optional(),
});

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

const MAX_WEBHOOK_SKEW_MS = 10 * 60 * 1000;

export function webhookTimestampIsFresh(
  value: string | null | undefined,
  now = Date.now(),
) {
  if (!value) return true;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return Math.abs(now - parsed) <= MAX_WEBHOOK_SKEW_MS;
}

export function parseSignedWebhook(
  body: string,
  signature: string | null,
  secret = getWebhookSecret(),
  timestampHeader?: string | null,
) {
  if (!secret)
    throw new PermanentIntegrationError("Webhook receiver is not configured");
  if (body.length > 16_384)
    throw new PermanentIntegrationError("Webhook payload is too large");
  if (!verifyWebhookSignature(secret, body, signature))
    throw new PermanentIntegrationError("Invalid webhook signature");
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new PermanentIntegrationError("Webhook payload was not valid JSON");
  }
  const event = webhookEventSchema.parse(parsed);
  const timestamp = timestampHeader || event.occurredAt || event.timestamp;
  if (timestamp && !webhookTimestampIsFresh(timestamp))
    throw new PermanentIntegrationError(
      "Webhook timestamp is outside the allowed window",
    );
  return event;
}

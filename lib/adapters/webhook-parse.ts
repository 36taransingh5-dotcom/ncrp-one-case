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
});

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export function parseSignedWebhook(
  body: string,
  signature: string | null,
  secret = getWebhookSecret(),
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
  return webhookEventSchema.parse(parsed);
}

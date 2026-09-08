import { PermanentIntegrationError } from "./errors";
import { isMissingRelation } from "@/lib/jobs/event-jobs";
import { logEvent } from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WebhookEvent } from "./webhook-parse";

export {
  parseSignedWebhook,
  webhookEventSchema,
  type WebhookEvent,
} from "./webhook-parse";

const EVENT_LABELS: Record<WebhookEvent["eventType"], string> = {
  "freeze.acknowledged": "Beneficiary-bank acknowledgement received",
  "freeze.completed": "Beneficiary-bank freeze callback received",
  "fir.registered": "Police FIR callback received",
  "job.updated": "External integration callback received",
};

async function resolveWebhookCaseId(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  event: WebhookEvent,
) {
  let caseId = event.caseId || "";
  if (!caseId && event.publicCaseId) {
    const { data: caseRow } = await supabase
      .from("cases")
      .select("id")
      .eq("public_case_id", event.publicCaseId)
      .maybeSingle();
    caseId = String(caseRow?.id || "");
  }
  if (!caseId) throw new PermanentIntegrationError("Unknown webhook case");
  return caseId;
}

async function applyWebhookSideEffects(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  event: WebhookEvent,
  caseId: string,
) {
  const eventType =
    event.eventType === "freeze.acknowledged" ||
    event.eventType === "freeze.completed"
      ? "AGENCY_ACKNOWLEDGED"
      : event.eventType === "fir.registered"
        ? "FIR_CALLBACK_RECEIVED"
        : "INTEGRATION_CALLBACK_RECEIVED";

  await supabase.from("case_events").insert({
    case_id: caseId,
    event_type: eventType,
    actor_type: "system",
    payload_json: {
      label: EVENT_LABELS[event.eventType],
      provider: event.provider,
      providerReference: event.providerReference,
      status: event.status,
      webhookEventId: event.eventId,
      simulated: false,
      http: true,
    },
    previous_state_json: { integration_callback: "pending" },
    new_state_json: { integration_callback: event.eventType },
    citizen_visible: true,
  });

  if (event.jobId && event.providerReference) {
    await supabase
      .from("integration_jobs")
      .update({
        external_reference: event.providerReference,
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.jobId)
      .eq("case_id", caseId);
  }
}

export async function applyIntegrationWebhook(event: WebhookEvent) {
  const supabase = createSupabaseAdminClient();
  const { data: existing, error: lookupError } = await supabase
    .from("integration_webhook_receipts")
    .select("id")
    .eq("event_id", event.eventId)
    .maybeSingle();
  const receiptsMissing = isMissingRelation(
    lookupError,
    "integration_webhook_receipts",
  );
  if (lookupError && !receiptsMissing) throw new Error(lookupError.message);
  if (existing)
    return { replayed: true as const, receiptId: String(existing.id) };

  const caseId = await resolveWebhookCaseId(supabase, event);

  if (receiptsMissing) {
    const { data: existingEvent } = await supabase
      .from("case_events")
      .select("id")
      .eq("case_id", caseId)
      .filter("payload_json->>webhookEventId", "eq", event.eventId)
      .maybeSingle();
    if (existingEvent)
      return { replayed: true as const, receiptId: String(existingEvent.id) };
    await applyWebhookSideEffects(supabase, event, caseId);
    logEvent("integration.webhook.applied", {
      caseId,
      operation: event.eventType,
      provider: event.provider,
    });
    return { replayed: false as const, receiptId: event.eventId, caseId };
  }

  const { data: receipt, error: receiptError } = await supabase
    .from("integration_webhook_receipts")
    .insert({
      provider: event.provider,
      event_id: event.eventId,
      event_type: event.eventType,
      case_id: caseId,
      job_id: event.jobId || null,
      payload_json: {
        providerReference: event.providerReference,
        status: event.status,
        securedAmount: event.securedAmount,
      },
    })
    .select("id")
    .single();
  if (receiptError) {
    if (receiptError.code === "23505")
      return { replayed: true as const, receiptId: event.eventId };
    throw new Error(receiptError.message);
  }

  await applyWebhookSideEffects(supabase, event, caseId);

  logEvent("integration.webhook.applied", {
    caseId,
    operation: event.eventType,
    provider: event.provider,
  });
  return { replayed: false as const, receiptId: String(receipt.id), caseId };
}

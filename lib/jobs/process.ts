import "server-only";

import { executeIntegrationAction } from "@/lib/adapters/execute";
import {
  getNotificationAdapter,
  isPermanentIntegrationError,
} from "@/lib/adapters";
import { resendRequestedWithoutConfig } from "@/lib/adapters/config";
import { emailTemplateFor } from "@/lib/adapters/email-templates";
import { recordEmailDelivery, resolveCitizenEmail } from "./email";
import { logEvent, logFailure } from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Job = {
  id: string;
  case_id: string;
  provider: string;
  action: string;
  payload_json: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  idempotency_key: string;
};

type OutboxEvent = {
  id: string;
  aggregate_id: string;
  event_type: string;
  payload_json: Record<string, unknown>;
  attempt_count: number;
};

export async function processIntegrationJobs(
  workerName: string,
  batchSize = 10,
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("claim_integration_jobs", {
    worker_name: workerName,
    batch_size: batchSize,
  });
  if (error) throw new Error(error.message);
  const results = [];
  for (const value of data || []) {
    const job = value as Job;
    try {
      const executed = await executeIntegrationAction(job);
      const respondedAt = new Date().toISOString();
      const requestId = String(
        executed.result.requestId || executed.externalReference,
      );
      const { error: updateError } = await supabase
        .from("integration_jobs")
        .update({
          status: "succeeded",
          external_reference: executed.externalReference,
          completed_at: respondedAt,
          updated_at: respondedAt,
          locked_at: null,
          locked_by: null,
          payload_json: {
            ...job.payload_json,
            provider: job.provider,
            integrationMode: executed.binding,
            requestId,
            requestedAt: job.payload_json.requestedAt || respondedAt,
            respondedAt,
            status: "succeeded",
          },
        })
        .eq("id", job.id);
      if (updateError) throw new Error(updateError.message);
      await supabase.from("case_events").insert({
        case_id: job.case_id,
        event_type: "INTEGRATION_JOB_COMPLETED",
        actor_type: "system",
        payload_json: {
          label:
            executed.binding === "http"
              ? "External response received"
              : "Simulated external response received",
          provider: job.provider,
          action: job.action,
          externalReference: executed.externalReference,
          adapter: executed.binding,
          simulated: executed.binding === "simulated",
          http: executed.binding === "http",
        },
        previous_state_json: { integration_status: "processing" },
        new_state_json: { integration_status: "succeeded" },
        citizen_visible: true,
      });
      logEvent("integration_job.completed", {
        jobId: job.id,
        caseId: job.case_id,
        provider: job.provider,
        operation: job.action,
      });
      results.push({ id: job.id, status: "succeeded" });
    } catch (jobError) {
      const exhausted =
        isPermanentIntegrationError(jobError) ||
        job.attempt_count >= job.max_attempts;
      const retryMinutes = Math.min(
        30,
        2 ** Math.max(0, job.attempt_count - 1),
      );
      await supabase
        .from("integration_jobs")
        .update({
          status: exhausted ? "failed" : "retrying",
          last_error:
            jobError instanceof Error
              ? jobError.message.slice(0, 500)
              : "Unknown error",
          next_attempt_at: new Date(
            Date.now() + retryMinutes * 60_000,
          ).toISOString(),
          updated_at: new Date().toISOString(),
          locked_at: null,
          locked_by: null,
        })
        .eq("id", job.id);
      logFailure("integration_job.failed", jobError, {
        jobId: job.id,
        caseId: job.case_id,
        provider: job.provider,
        operation: job.action,
        exhausted,
      });
      results.push({ id: job.id, status: exhausted ? "failed" : "retrying" });
    }
  }
  return results;
}

export async function processOutboxEvents(workerName: string, batchSize = 25) {
  const supabase = createSupabaseAdminClient();
  const { error: recoveryError } = await supabase.rpc("recover_stale_work");
  if (recoveryError) throw new Error(recoveryError.message);
  const { data, error } = await supabase.rpc("claim_outbox_events", {
    worker_name: workerName,
    batch_size: batchSize,
  });
  if (error) throw new Error(error.message);
  const results = [];
  for (const value of data || []) {
    const event = value as OutboxEvent;
    try {
      const sourceEventId = String(event.payload_json.event_id || "");
      if (!sourceEventId)
        throw new Error("Outbox event has no persisted source event.");
      const { data: source, error: sourceError } = await supabase
        .from("case_events")
        .select("id")
        .eq("id", sourceEventId)
        .eq("case_id", event.aggregate_id)
        .single();
      if (sourceError || !source)
        throw new Error("Persisted source event is unavailable.");
      const template = emailTemplateFor(event.event_type);
      if (!template) {
        const { error: skipError } = await supabase
          .from("outbox_events")
          .update({
            status: "published",
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_error: null,
            payload_json: {
              ...event.payload_json,
              email: "skipped",
            },
          })
          .eq("id", event.id);
        if (skipError) throw new Error(skipError.message);
        results.push({ id: event.id, status: "published" });
        continue;
      }
      const citizen = await resolveCitizenEmail(event.aggregate_id);
      if (resendRequestedWithoutConfig() || !citizen?.email) {
        await recordEmailDelivery({
          outboxEventId: event.id,
          caseId: event.aggregate_id,
          recipient: citizen?.email || "none",
          template: event.event_type,
          status: citizen?.email ? "not_configured" : "skipped",
          attemptCount: event.attempt_count,
          lastError: citizen?.email
            ? "Resend is not configured"
            : "Citizen email is unavailable",
        });
        const { error: skipError } = await supabase
          .from("outbox_events")
          .update({
            status: "published",
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_error: null,
            payload_json: {
              ...event.payload_json,
              email: citizen?.email ? "not_configured" : "skipped",
            },
          })
          .eq("id", event.id);
        if (skipError) throw new Error(skipError.message);
        results.push({ id: event.id, status: "published" });
        continue;
      }
      const publicCaseId = citizen.publicCaseId;
      const notification = await getNotificationAdapter().send(
        {
          recipient: citizen.userId,
          to: citizen.email,
          template: event.event_type,
          caseReference: event.aggregate_id,
          publicCaseId,
          subject: template.subject(publicCaseId),
          text: template.text(publicCaseId),
        },
        { idempotencyKey: `outbox:${event.id}`, timeoutMs: 8_000 },
      );
      await recordEmailDelivery({
        outboxEventId: event.id,
        caseId: event.aggregate_id,
        recipient: citizen.email,
        template: event.event_type,
        status: "sent",
        attemptCount: event.attempt_count,
        messageId: notification.messageReference,
      });
      const { error: updateError } = await supabase
        .from("outbox_events")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null,
          payload_json: {
            ...event.payload_json,
            notification_reference: notification.messageReference,
          },
        })
        .eq("id", event.id);
      if (updateError) throw new Error(updateError.message);
      logEvent("outbox.published", {
        caseId: event.aggregate_id,
        jobId: event.id,
        operation: event.event_type,
      });
      results.push({ id: event.id, status: "published" });
    } catch (outboxError) {
      const retryMinutes = Math.min(
        30,
        2 ** Math.max(0, event.attempt_count - 1),
      );
      await supabase
        .from("outbox_events")
        .update({
          status: "failed",
          available_at: new Date(
            Date.now() + retryMinutes * 60_000,
          ).toISOString(),
          last_error:
            outboxError instanceof Error
              ? outboxError.message.slice(0, 500)
              : "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", event.id);
      logFailure("outbox.publish_failed", outboxError, {
        caseId: event.aggregate_id,
        jobId: event.id,
        operation: event.event_type,
      });
      await recordEmailDelivery({
        outboxEventId: event.id,
        caseId: event.aggregate_id,
        recipient: "unknown",
        template: event.event_type,
        status: "failed",
        attemptCount: event.attempt_count,
        lastError:
          outboxError instanceof Error
            ? outboxError.message.slice(0, 500)
            : "Unknown error",
      });
      results.push({ id: event.id, status: "failed" });
    }
  }
  return results;
}

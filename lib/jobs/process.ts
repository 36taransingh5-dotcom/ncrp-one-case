import "server-only";

import {
  simulatedBankAdapter,
  simulatedNotificationAdapter,
  simulatedPoliceAdapter,
} from "@/lib/adapters/simulated";
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

async function executeJob(job: Job) {
  const context = { idempotencyKey: job.idempotency_key, timeoutMs: 8_000 };
  if (job.provider === "bank" && job.action === "request_freeze")
    return simulatedBankAdapter.requestFreeze(
      job.case_id,
      String(job.payload_json.accountRef || "Beneficiary account (masked)"),
      Number(job.payload_json.amount || 0),
      context,
    );
  if (job.provider === "police" && job.action === "assign_cyber_cell")
    return simulatedPoliceAdapter.assignCyberCell(job.case_id, context);
  if (job.provider === "police" && job.action === "start_fir_review")
    return simulatedPoliceAdapter.startFirReview(job.case_id, context);
  if (job.provider === "police" && job.action === "register_fir")
    return simulatedPoliceAdapter.registerFir(job.case_id, context);
  throw new Error(`Unsupported integration job: ${job.provider}.${job.action}`);
}

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
      const adapterResult = await executeJob(job);
      const externalReference = String(
        (adapterResult as Record<string, unknown>).providerReference ||
          (adapterResult as Record<string, unknown>).assignmentReference ||
          (adapterResult as Record<string, unknown>).reviewReference ||
          (adapterResult as Record<string, unknown>).firNumber ||
          "SIMULATED-COMPLETE",
      );
      const { error: updateError } = await supabase
        .from("integration_jobs")
        .update({
          status: "succeeded",
          external_reference: externalReference,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          locked_at: null,
          locked_by: null,
        })
        .eq("id", job.id);
      if (updateError) throw new Error(updateError.message);
      await supabase.from("case_events").insert({
        case_id: job.case_id,
        event_type: "INTEGRATION_JOB_COMPLETED",
        actor_type: "system",
        payload_json: {
          label: "Simulated external response received",
          provider: job.provider,
          action: job.action,
          externalReference,
          simulated: true,
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
      const exhausted = job.attempt_count >= job.max_attempts;
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
      const notification = await simulatedNotificationAdapter.send(
        {
          recipient: "case-citizen",
          template: event.event_type,
          caseReference: event.aggregate_id,
        },
        { idempotencyKey: `outbox:${event.id}`, timeoutMs: 8_000 },
      );
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
      results.push({ id: event.id, status: "failed" });
    }
  }
  return results;
}

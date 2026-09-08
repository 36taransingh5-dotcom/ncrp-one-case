import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logFailure } from "@/lib/observability";
import { jobsForCaseEvent } from "./event-jobs";

export async function enqueueJobsForCaseEvent(
  caseId: string,
  eventType: string,
) {
  const jobs = jobsForCaseEvent(eventType);
  if (!jobs.length) return [];
  const supabase = createSupabaseAdminClient();
  const queued: string[] = [];
  for (const job of jobs) {
    const { error } = await supabase.from("integration_jobs").insert({
      case_id: caseId,
      provider: job.provider,
      action: job.action,
      payload_json: { source: "application", eventType },
      idempotency_key: job.idempotencyKey(caseId),
    });
    if (error && error.code !== "23505") {
      logFailure("integration_job.enqueue_failed", error, {
        caseId,
        operation: job.action,
        provider: job.provider,
      });
      throw new Error(error.message);
    }
    if (!error) queued.push(job.action);
  }
  return queued;
}

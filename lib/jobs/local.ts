import crypto from "node:crypto";
import { db, initializeDatabase } from "@/lib/db";
import { executeIntegrationAction } from "@/lib/adapters/execute";
import { isPermanentIntegrationError } from "@/lib/adapters";
import { logEvent, logFailure } from "@/lib/observability";
import {
  freezeAckNotification,
  isDemoFreezeRetry,
  isFreezeJob,
  jobCompletionLabel,
  retryDelayMs,
  sanitizeJobError,
} from "./status";

type JobRow = {
  id: string;
  case_id: string;
  provider: string;
  action: string;
  payload_json: string | Record<string, unknown>;
  status: string;
  attempt_count: number;
  max_attempts: number;
  idempotency_key: string;
  last_error: string | null;
};

const json = (value: unknown) => JSON.stringify(value);
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

function payloadOf(job: JobRow): Record<string, unknown> {
  if (typeof job.payload_json === "string") {
    try {
      return JSON.parse(job.payload_json) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return job.payload_json || {};
}

export function listLocalIntegrationJobs(caseId: string) {
  initializeDatabase();
  return db
    .prepare(
      "SELECT id,provider,action,status,external_reference,attempt_count,max_attempts,last_error,created_at,completed_at,updated_at FROM integration_jobs WHERE case_id=? ORDER BY created_at DESC",
    )
    .all(caseId) as Record<string, unknown>[];
}

export function enqueueLocalFreezeJob(input: {
  caseId: string;
  accountRef: string;
  amount: number;
  demonstrateRetry: boolean;
}) {
  initializeDatabase();
  const at = now();
  db.prepare(
    "INSERT OR IGNORE INTO integration_jobs(id,case_id,provider,action,payload_json,status,attempt_count,max_attempts,idempotency_key,created_at,updated_at,next_attempt_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    id(),
    input.caseId,
    "bank",
    "request_freeze",
    json({
      accountRef: input.accountRef,
      amount: input.amount,
      demonstrateRetry: input.demonstrateRetry,
    }),
    "pending",
    0,
    5,
    `bank:freeze:${input.caseId}`,
    at,
    at,
    at,
  );
}

export function markLocalFreezeJobsReady(caseId: string) {
  initializeDatabase();
  const result = db
    .prepare(
      "UPDATE integration_jobs SET next_attempt_at=?,updated_at=?,locked_at=NULL,locked_by=NULL WHERE case_id=? AND action='request_freeze' AND status IN ('pending','retrying')",
    )
    .run(now(), now(), caseId);
  return Number(result.changes || 0);
}

function notifyCitizen(
  caseId: string,
  type: string,
  title: string,
  body: string,
) {
  const user = db
    .prepare(
      "SELECT u.id FROM users u JOIN citizens c ON c.user_id=u.id JOIN cases k ON k.citizen_id=c.id WHERE k.id=?",
    )
    .get(caseId) as { id: string } | undefined;
  if (!user) return;
  db.prepare("INSERT INTO notifications VALUES(?,?,?,?,?,?,?,?)").run(
    id(),
    user.id,
    caseId,
    type,
    title,
    body,
    null,
    now(),
  );
}

function recordFreezeAcknowledgement(job: JobRow, externalReference: string) {
  const at = now();
  db.prepare("INSERT INTO case_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
    id(),
    job.case_id,
    "INTEGRATION_JOB_COMPLETED",
    "system",
    null,
    "inst-hdfc",
    json({
      label: jobCompletionLabel(job),
      provider: job.provider,
      action: job.action,
      externalReference,
      simulated: true,
    }),
    json({ integration_status: "processing" }),
    json({ integration_status: "succeeded" }),
    1,
    at,
    at,
  );
  const notice = freezeAckNotification();
  notifyCitizen(job.case_id, "bank_acknowledged", notice.title, notice.body);
  db.prepare("UPDATE cases SET last_activity_at=?,updated_at=? WHERE id=?").run(
    at,
    at,
    job.case_id,
  );
}

export async function processLocalIntegrationJobs(
  workerName: string,
  batchSize = 10,
) {
  initializeDatabase();
  const ready = db
    .prepare(
      "SELECT * FROM integration_jobs WHERE status IN ('pending','retrying') AND next_attempt_at<=? ORDER BY created_at LIMIT ?",
    )
    .all(now(), batchSize) as JobRow[];
  const results = [];
  for (const job of ready) {
    db.prepare(
      "UPDATE integration_jobs SET status='processing',attempt_count=attempt_count+1,locked_by=?,locked_at=?,updated_at=? WHERE id=? AND status IN ('pending','retrying')",
    ).run(workerName, now(), now(), job.id);
    const claimed = db
      .prepare("SELECT * FROM integration_jobs WHERE id=?")
      .get(job.id) as JobRow | undefined;
    if (!claimed || claimed.status !== "processing") continue;
    const payload = payloadOf(claimed);
    try {
      const executed = await executeIntegrationAction({
        case_id: claimed.case_id,
        provider: claimed.provider,
        action: claimed.action,
        payload_json: payload,
        idempotency_key: claimed.idempotency_key,
        attempt_count: claimed.attempt_count,
      });
      const respondedAt = now();
      db.prepare(
        "UPDATE integration_jobs SET status='succeeded',external_reference=?,completed_at=?,updated_at=?,locked_at=NULL,locked_by=NULL,last_error=NULL,payload_json=? WHERE id=?",
      ).run(
        executed.externalReference,
        respondedAt,
        respondedAt,
        json({
          ...payload,
          provider: claimed.provider,
          status: "succeeded",
          respondedAt,
        }),
        claimed.id,
      );
      if (isFreezeJob(claimed))
        recordFreezeAcknowledgement(claimed, executed.externalReference);
      logEvent("integration_job.completed", {
        jobId: claimed.id,
        caseId: claimed.case_id,
        provider: claimed.provider,
        operation: claimed.action,
      });
      results.push({ id: claimed.id, status: "succeeded" });
    } catch (jobError) {
      const exhausted =
        isPermanentIntegrationError(jobError) ||
        claimed.attempt_count >= claimed.max_attempts;
      const demoFreezeRetry = isDemoFreezeRetry(payload);
      const delay = retryDelayMs({
        attemptCount: claimed.attempt_count,
        demoFreezeRetry,
      });
      const lastError = sanitizeJobError(jobError, {
        retrying: !exhausted,
        freeze: isFreezeJob(claimed),
      });
      db.prepare(
        "UPDATE integration_jobs SET status=?,last_error=?,next_attempt_at=?,updated_at=?,locked_at=NULL,locked_by=NULL WHERE id=?",
      ).run(
        exhausted ? "failed" : "retrying",
        lastError,
        new Date(Date.now() + delay).toISOString(),
        now(),
        claimed.id,
      );
      logFailure("integration_job.failed", jobError, {
        jobId: claimed.id,
        caseId: claimed.case_id,
        provider: claimed.provider,
        operation: claimed.action,
        exhausted,
      });
      results.push({
        id: claimed.id,
        status: exhausted ? "failed" : "retrying",
      });
    }
  }
  return results;
}

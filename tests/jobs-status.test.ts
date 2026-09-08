import test from "node:test";
import assert from "node:assert/strict";
import {
  BANK_ACKNOWLEDGED,
  BANK_RETRY_QUEUED,
  freezeJobStatusLabel,
  retryDelayMs,
  sandboxFreezeRetryShouldFail,
  sanitizeJobError,
} from "../lib/jobs/status";

test("sandbox freeze retry fails only on the first controlled POST", () => {
  assert.equal(
    sandboxFreezeRetryShouldFail({
      path: "v1/freeze-requests",
      method: "POST",
      demo: "freeze-retry-once",
      attempt: "1",
    }),
    true,
  );
  assert.equal(
    sandboxFreezeRetryShouldFail({
      path: "v1/freeze-requests",
      method: "POST",
      demo: "freeze-retry-once",
      attempt: "2",
    }),
    false,
  );
  assert.equal(
    sandboxFreezeRetryShouldFail({
      path: "v1/freeze-requests",
      method: "GET",
      demo: "freeze-retry-once",
      attempt: "1",
    }),
    false,
  );
  assert.equal(
    sandboxFreezeRetryShouldFail({
      path: "v1/freeze-requests",
      method: "POST",
      demo: null,
      attempt: "1",
    }),
    false,
  );
});

test("job errors never surface raw HTTP 503 to operators", () => {
  assert.equal(
    sanitizeJobError(new Error("bank returned HTTP 503"), {
      retrying: true,
      freeze: true,
    }),
    BANK_RETRY_QUEUED,
  );
  assert.doesNotMatch(
    sanitizeJobError(new Error("bank returned HTTP 503"), {
      retrying: false,
      freeze: true,
    }),
    /503/,
  );
  assert.equal(
    freezeJobStatusLabel({
      action: "request_freeze",
      status: "retrying",
      last_error: BANK_RETRY_QUEUED,
    }),
    BANK_RETRY_QUEUED,
  );
  assert.equal(
    freezeJobStatusLabel({
      action: "request_freeze",
      status: "succeeded",
    }),
    BANK_ACKNOWLEDGED,
  );
});

test("demo freeze retries immediately while ordinary 503s stay backed off", () => {
  assert.equal(retryDelayMs({ attemptCount: 1, demoFreezeRetry: true }), 0);
  assert.equal(
    retryDelayMs({ attemptCount: 1, demoFreezeRetry: false }),
    60_000,
  );
});

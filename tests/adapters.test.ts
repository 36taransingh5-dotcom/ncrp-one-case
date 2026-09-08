import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import {
  PermanentIntegrationError,
  RetryableIntegrationError,
} from "../lib/adapters/errors";
import { integrationFetch } from "../lib/adapters/http-client";
import {
  resolveIntegrationMode,
  resolveProviderBinding,
} from "../lib/adapters/config";
import { executeIntegrationAction } from "../lib/adapters/execute";
import { createHttpBankAdapter } from "../lib/adapters/http";
import {
  signWebhookBody,
  verifyWebhookSignature,
} from "../lib/adapters/signature";
import { parseSignedWebhook } from "../lib/adapters/webhook-parse";
import { isMissingRelation, jobsForCaseEvent } from "../lib/jobs/event-jobs";

async function withServer(
  handler: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: string,
  ) => void,
  run: (baseUrl: string) => Promise<void>,
) {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () =>
      handler(req, res, Buffer.concat(chunks).toString("utf8")),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("simulated freeze and reporting jobs return adapter references", async () => {
  const freeze = await executeIntegrationAction({
    case_id: "case-golden",
    provider: "bank",
    action: "request_freeze",
    payload_json: { accountRef: "HDFC ••9281", amount: 6700 },
    idempotency_key: "test-freeze",
  });
  assert.equal(freeze.binding, "simulated");
  assert.match(freeze.externalReference, /HDFC-SIM-/);

  const report = await executeIntegrationAction({
    case_id: "case-golden",
    provider: "reporting",
    action: "create_external_complaint",
    payload_json: {},
    idempotency_key: "test-report",
  });
  assert.match(report.externalReference, /NCRP-SIM-/);
});

test("HTTP client classifies 503 as retryable and 422 as permanent", async () => {
  await withServer(
    (_req, res) => {
      res.statusCode = 503;
      res.end("unavailable");
    },
    async (baseUrl) => {
      await assert.rejects(
        () =>
          integrationFetch({
            baseUrl,
            apiKey: "k",
            provider: "bank",
            path: "/v1/freeze-requests",
            idempotencyKey: "idem-1",
            timeoutMs: 2_000,
            body: { caseId: "case-1" },
          }),
        RetryableIntegrationError,
      );
    },
  );
  await withServer(
    (_req, res) => {
      res.statusCode = 422;
      res.end("rejected");
    },
    async (baseUrl) => {
      await assert.rejects(
        () =>
          integrationFetch({
            baseUrl,
            apiKey: "k",
            provider: "bank",
            path: "/v1/freeze-requests",
            idempotencyKey: "idem-2",
            timeoutMs: 2_000,
            body: { caseId: "case-1" },
          }),
        PermanentIntegrationError,
      );
    },
  );
});

test("HTTP bank adapter sends idempotency keys and polls freeze status", async () => {
  const seen: { url?: string; method?: string; idempotency?: string }[] = [];
  await withServer(
    (req, res, body) => {
      seen.push({
        url: req.url,
        method: req.method,
        idempotency: String(req.headers["idempotency-key"] || ""),
      });
      assert.equal(req.headers.authorization, "Bearer test-bank-key");
      assert.doesNotMatch(body, /complaint|narrative|password/i);
      if (req.method === "POST" && req.url === "/v1/freeze-requests") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            requestId: "FREEZE-1",
            accepted: true,
            providerReference: "HDFC-HTTP-1",
          }),
        );
        return;
      }
      if (
        req.method === "GET" &&
        req.url === "/v1/freeze-requests/HDFC-HTTP-1"
      ) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "completed", securedAmount: 6700 }));
        return;
      }
      res.statusCode = 404;
      res.end();
    },
    async (baseUrl) => {
      const bank = createHttpBankAdapter({
        baseUrl,
        apiKey: "test-bank-key",
      });
      const freeze = await bank.requestFreeze("case-1", "HDFC ••9281", 6700, {
        idempotencyKey: "freeze-key",
        timeoutMs: 2_000,
      });
      assert.equal(freeze.providerReference, "HDFC-HTTP-1");
      const status = await bank.getFreezeStatus("HDFC-HTTP-1", {
        idempotencyKey: "status-key",
        timeoutMs: 2_000,
      });
      assert.equal(status.status, "completed");
      assert.equal(status.securedAmount, 6700);
      assert.equal(seen[0]?.idempotency, "freeze-key");
      assert.ok(seen.some((item) => item.method === "GET"));
    },
  );
});

test("hosted Supabase deployments enable HTTP when a sandbox secret exists", () => {
  assert.equal(resolveIntegrationMode("", "local", true), "simulated");
  assert.equal(resolveIntegrationMode("", "supabase", false), "simulated");
  assert.equal(resolveIntegrationMode("", "supabase", true), "http");
  assert.equal(
    resolveIntegrationMode("simulated", "supabase", true),
    "simulated",
  );
  assert.equal(resolveIntegrationMode("http", "local", false), "http");
});

test("missing HTTP credentials keep the simulated binding", () => {
  assert.equal(
    resolveProviderBinding("simulated", "https://bank.example", "k"),
    "simulated",
  );
  assert.equal(resolveProviderBinding("http", "", "k"), "simulated");
  assert.equal(
    resolveProviderBinding("http", "https://bank.example", ""),
    "simulated",
  );
  assert.equal(
    resolveProviderBinding("http", "https://bank.example", "k"),
    "http",
  );
});

test("missing webhook receipt tables are treated as an unapplied migration", () => {
  assert.equal(
    isMissingRelation(
      { code: "PGRST205", message: "Could not find the table" },
      "integration_webhook_receipts",
    ),
    true,
  );
  assert.equal(
    isMissingRelation({ code: "42501", message: "permission denied" }, "x"),
    false,
  );
  assert.equal(
    jobsForCaseEvent("CASE_CREATED")[0]?.action,
    "create_external_complaint",
  );
  assert.equal(jobsForCaseEvent("FREEZE_REQUEST_CREATED").length, 0);
});

test("webhook signatures are required and compared in constant time", () => {
  const secret = "webhook-secret";
  const body = JSON.stringify({
    eventId: "evt-12345678",
    eventType: "freeze.acknowledged",
    provider: "bank",
    caseId: "11111111-1111-1111-1111-111111111111",
    providerReference: "HDFC-HTTP-1",
  });
  const signature = signWebhookBody(secret, body);
  assert.equal(verifyWebhookSignature(secret, body, signature), true);
  assert.equal(verifyWebhookSignature(secret, body, "sha256=deadbeef"), false);
  const parsed = parseSignedWebhook(body, signature, secret);
  assert.equal(parsed.eventType, "freeze.acknowledged");
  assert.throws(
    () => parseSignedWebhook(body, "sha256=000000", secret),
    /Invalid webhook signature/,
  );
});

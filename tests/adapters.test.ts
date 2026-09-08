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
  RESEND_TEST_FROM,
  resolveIntegrationMode,
  resolveNotificationProvider,
  resolveProviderBinding,
  resolveResendFromAddress,
  resendApiKeyPresent,
  resendUsesSharedTestSender,
} from "../lib/adapters/config";
import { executeIntegrationAction } from "../lib/adapters/execute";
import { createHttpBankAdapter } from "../lib/adapters/http";
import {
  signWebhookBody,
  verifyWebhookSignature,
} from "../lib/adapters/signature";
import {
  parseSignedWebhook,
  webhookTimestampIsFresh,
} from "../lib/adapters/webhook-parse";
import { isMissingRelation, jobsForCaseEvent } from "../lib/jobs/event-jobs";
import {
  emailContainsSensitiveFinancialData,
  emailTemplateFor,
} from "../lib/adapters/email-templates";
import {
  buildDigiLockerAuthorizationUrl,
  decryptSecret,
  encryptSecret,
  getApiSetuMode,
  getDigiLockerMode,
  resolveIdentityMode,
  signOauthState,
  verifyOauthState,
} from "../lib/adapters/identity";

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

test("demo freeze retry fails once on attempt 1 then succeeds on the same job", async () => {
  const job = {
    case_id: "case-retry",
    provider: "bank",
    action: "request_freeze",
    payload_json: {
      demonstrateRetry: true,
      accountRef: "HDFC ••9281",
      amount: 2100,
    },
    idempotency_key: "bank:freeze:case-retry",
  };
  await assert.rejects(
    () => executeIntegrationAction({ ...job, attempt_count: 1 }),
    (error: unknown) =>
      error instanceof RetryableIntegrationError && error.status === 503,
  );
  const recovered = await executeIntegrationAction({
    ...job,
    attempt_count: 2,
  });
  assert.match(recovered.externalReference, /HDFC-SIM-/);
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

test("HTTP freeze demo mode sends controlled retry headers and recovers on attempt 2", async () => {
  const seen: { demo?: string; attempt?: string }[] = [];
  await withServer(
    (req, res) => {
      seen.push({
        demo: String(req.headers["x-ncrp-sandbox-demo"] || ""),
        attempt: String(req.headers["x-ncrp-job-attempt"] || ""),
      });
      if (req.headers["x-ncrp-job-attempt"] === "1") {
        res.statusCode = 503;
        res.end("unavailable");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          requestId: "FREEZE-RETRY-2",
          accepted: true,
          providerReference: "HDFC-RETRY-2",
        }),
      );
    },
    async (baseUrl) => {
      const bank = createHttpBankAdapter({
        baseUrl,
        apiKey: "test-bank-key",
      });
      await assert.rejects(
        () =>
          bank.requestFreeze("case-1", "HDFC ••9281", 2100, {
            idempotencyKey: "bank:freeze:case-1",
            timeoutMs: 2_000,
            attemptCount: 1,
            demoFreezeRetry: true,
          }),
        RetryableIntegrationError,
      );
      const recovered = await bank.requestFreeze(
        "case-1",
        "HDFC ••9281",
        2100,
        {
          idempotencyKey: "bank:freeze:case-1",
          timeoutMs: 2_000,
          attemptCount: 2,
          demoFreezeRetry: true,
        },
      );
      assert.equal(recovered.providerReference, "HDFC-RETRY-2");
      assert.equal(seen[0]?.demo, "freeze-retry-once");
      assert.equal(seen[0]?.attempt, "1");
      assert.equal(seen[1]?.attempt, "2");
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

test("webhook timestamps outside the replay window are rejected", () => {
  assert.equal(webhookTimestampIsFresh(new Date().toISOString()), true);
  assert.equal(webhookTimestampIsFresh(undefined), true);
  assert.equal(
    webhookTimestampIsFresh(new Date(Date.now() - 11 * 60_000).toISOString()),
    false,
  );
  const secret = "webhook-secret";
  const body = JSON.stringify({
    eventId: "evt-87654321",
    eventType: "freeze.acknowledged",
    provider: "bank",
    caseId: "11111111-1111-1111-1111-111111111111",
    occurredAt: new Date(Date.now() - 20 * 60_000).toISOString(),
  });
  const signature = signWebhookBody(secret, body);
  assert.throws(
    () => parseSignedWebhook(body, signature, secret),
    /timestamp is outside/,
  );
});

test("email templates omit amounts and account data", () => {
  const funds = emailTemplateFor("FUNDS_SECURED");
  assert.ok(funds);
  const text = funds.text("NCRP-26-111111");
  assert.equal(emailContainsSensitiveFinancialData(text), false);
  assert.match(text, /NCRP-26-111111/);
  const created = emailTemplateFor("CASE_CREATED");
  assert.ok(created);
  assert.equal(
    emailContainsSensitiveFinancialData(created.text("NCRP-26-111111")),
    false,
  );
  assert.match(created.text("NCRP-26-111111"), /NCRP-26-111111/);
});

test("DigiLocker and API Setu stay disabled without credentials", () => {
  assert.equal(getDigiLockerMode(), "disabled");
  assert.equal(getApiSetuMode(), "disabled");
  assert.equal(resolveIdentityMode("", "", ""), "disabled");
  assert.equal(resolveIdentityMode("disabled", "id", "secret"), "disabled");
  assert.equal(resolveIdentityMode("", "id", "secret"), "sandbox");
  assert.equal(resolveIdentityMode("live", "id", "secret"), "live");
});

test("DigiLocker OAuth uses official meripehchaan endpoints and signed state", () => {
  const state = signOauthState({
    userId: "user-1",
    caseId: "NCRP-26-111111",
    nonce: "nonce-1",
  });
  const parsed = verifyOauthState(state);
  assert.equal(parsed?.userId, "user-1");
  assert.equal(parsed?.caseId, "NCRP-26-111111");
  assert.equal(verifyOauthState("tampered.payload"), null);
  const url = buildDigiLockerAuthorizationUrl({
    clientId: "partner-client",
    redirectUri:
      "https://ncrp-one-case.vercel.app/api/integrations/digilocker/callback",
    state,
    codeChallenge: "challenge",
  });
  assert.match(
    url,
    /digilocker\.meripehchaan\.gov\.in\/public\/oauth2\/1\/authorize/,
  );
  assert.match(url, /client_id=partner-client/);
  assert.match(url, /code_challenge_method=S256/);
  assert.equal(decryptSecret(encryptSecret("access-token")), "access-token");
});

test("Resend binds from API key alone and defaults the test sender", () => {
  assert.equal(resendApiKeyPresent(""), false);
  assert.equal(resendApiKeyPresent("re_test_key"), true);
  assert.equal(resolveResendFromAddress(), RESEND_TEST_FROM);
  assert.equal(resolveResendFromAddress("", "  "), RESEND_TEST_FROM);
  assert.equal(
    resolveResendFromAddress("", "Alerts <ops@example.org>"),
    "Alerts <ops@example.org>",
  );
  assert.equal(
    resolveResendFromAddress("NCRP <cases@ncrp.example>", "other@example.org"),
    "NCRP <cases@ncrp.example>",
  );
  assert.equal(resolveNotificationProvider("", true, "http"), "resend");
  assert.equal(resolveNotificationProvider("http", true, "http"), "resend");
  assert.equal(
    resolveNotificationProvider("resend", false, "http"),
    "simulated",
  );
  assert.equal(resolveNotificationProvider("", false, "http"), "http");
  assert.equal(resendUsesSharedTestSender(RESEND_TEST_FROM), true);
  assert.equal(
    resendUsesSharedTestSender("NCRP One Case <noreply@example.org>"),
    false,
  );
});

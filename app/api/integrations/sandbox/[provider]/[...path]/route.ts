import { NextResponse } from "next/server";
import { z } from "zod";
import { getProviderApiKey, getSandboxSecret } from "@/lib/adapters/config";
import type { IntegrationProvider } from "@/lib/adapters/config";
import { tokenMatches } from "@/lib/adapters/signature";
import { logEvent } from "@/lib/observability";

export const dynamic = "force-dynamic";

const providers = ["bank", "police", "reporting", "notification"] as const;

function isProvider(value: string): value is IntegrationProvider {
  return (providers as readonly string[]).includes(value);
}

function authorized(provider: IntegrationProvider, request: Request) {
  const expected = getProviderApiKey(provider) || getSandboxSecret();
  if (!expected) {
    return process.env.NODE_ENV !== "production";
  }
  return tokenMatches(expected, request.headers.get("authorization"));
}

function sandboxReference(prefix: string, seed: string) {
  const compact = seed.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "SANDBOX";
  return `${prefix}-SBX-${compact.toUpperCase()}`;
}

function forcedError(request: Request) {
  return request.headers.get("x-ncrp-sandbox-error");
}

async function sandboxResponse(
  provider: IntegrationProvider,
  path: string[],
  request: Request,
) {
  if (!authorized(provider, request))
    return NextResponse.json(
      { error: "Unauthorized sandbox request." },
      {
        status: 401,
      },
    );
  const injected = forcedError(request);
  if (injected === "timeout")
    return NextResponse.json({ error: "Sandbox timeout" }, { status: 408 });
  if (injected === "retryable")
    return NextResponse.json({ error: "Sandbox unavailable" }, { status: 503 });
  if (injected === "permanent")
    return NextResponse.json(
      { error: "Sandbox rejected request" },
      {
        status: 422,
      },
    );

  const method = request.method;
  const idempotencyKey =
    request.headers.get("idempotency-key") ||
    sandboxReference("IDEM", provider);
  const body =
    method === "GET"
      ? {}
      : ((await request.json().catch(() => ({}))) as Record<string, unknown>);
  const caseId = String(body.caseId || path[path.length - 1] || "case");
  const joined = path.join("/");

  logEvent("adapter.sandbox.request", {
    provider,
    operation: joined || "root",
    adapter: "sandbox",
  });

  if (provider === "bank" && joined === "v1/fraud-notifications")
    return NextResponse.json({
      accepted: true,
      reference: sandboxReference("BANK", idempotencyKey),
    });
  if (provider === "bank" && joined === "v1/beneficiary-lookup")
    return NextResponse.json({
      institutionId: "inst-hdfc",
      accountRef: "HDFC ••9281",
      reference: sandboxReference("BENEFICIARY", idempotencyKey),
    });
  if (provider === "bank" && joined === "v1/freeze-requests")
    return NextResponse.json({
      requestId: sandboxReference("FREEZE", idempotencyKey),
      accepted: true,
      providerReference: sandboxReference("HDFC", caseId),
    });
  if (
    provider === "bank" &&
    joined.startsWith("v1/freeze-requests/") &&
    joined.endsWith("/reconcile")
  )
    return NextResponse.json({ reconciled: true });
  if (provider === "bank" && joined.startsWith("v1/freeze-requests/"))
    return NextResponse.json({
      status: "completed",
      securedAmount: Number(body.amount || 0),
    });
  if (provider === "police" && joined === "v1/assignments")
    return NextResponse.json({
      assignmentReference: sandboxReference("POLICE", caseId),
    });
  if (provider === "police" && joined === "v1/fir-reviews")
    return NextResponse.json({
      reviewReference: sandboxReference("REVIEW", caseId),
    });
  if (provider === "police" && joined === "v1/firs")
    return NextResponse.json({
      firNumber: `SBX-FIR-${sandboxReference("FIR", caseId).slice(-6)}/2026`,
    });
  if (provider === "reporting" && joined === "v1/complaints")
    return NextResponse.json({
      externalReference: sandboxReference("NCRP", caseId),
    });
  if (provider === "notification" && joined === "v1/messages")
    return NextResponse.json({
      messageReference: sandboxReference("NOTICE", caseId),
    });

  return NextResponse.json(
    { error: "Unknown sandbox route." },
    { status: 404 },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string; path?: string[] }> },
) {
  const params = await context.params;
  if (!isProvider(params.provider))
    return NextResponse.json({ error: "Unknown provider." }, { status: 404 });
  return sandboxResponse(params.provider, params.path || [], request);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string; path?: string[] }> },
) {
  const params = await context.params;
  if (!isProvider(params.provider))
    return NextResponse.json({ error: "Unknown provider." }, { status: 404 });
  return sandboxResponse(params.provider, params.path || [], request);
}

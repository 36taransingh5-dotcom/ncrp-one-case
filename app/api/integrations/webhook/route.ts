import { NextResponse } from "next/server";
import { z } from "zod";
import {
  applyIntegrationWebhook,
  parseSignedWebhook,
} from "@/lib/adapters/webhook";
import { PermanentIntegrationError } from "@/lib/adapters/errors";
import { getWebhookSecret } from "@/lib/adapters/config";
import { logFailure } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!getWebhookSecret())
    return NextResponse.json(
      { error: "Webhook receiver is not configured." },
      { status: 503 },
    );
  const body = await request.text();
  try {
    const event = parseSignedWebhook(
      body,
      request.headers.get("x-ncrp-signature"),
    );
    const result = await applyIntegrationWebhook(event);
    return NextResponse.json(result, {
      status: result.replayed ? 200 : 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logFailure("integration.webhook.rejected", error);
    if (error instanceof PermanentIntegrationError) {
      const status = error.message.includes("signature")
        ? 401
        : error.message.includes("too large")
          ? 413
          : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Webhook payload was rejected." },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "Webhook could not be processed." },
      { status: 500 },
    );
  }
}

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  processIntegrationJobs,
  processOutboxEvents,
} from "@/lib/jobs/process";

async function processQueues(request: Request, body: unknown) {
  const supplied = request.headers.get("authorization");
  const validTokens = [process.env.NCRP_WORKER_SECRET, process.env.CRON_SECRET]
    .filter(Boolean)
    .map((token) => `Bearer ${token}`);
  if (!supplied || !validTokens.includes(supplied))
    return NextResponse.json(
      { error: "Worker authentication required." },
      { status: 401 },
    );
  try {
    const input = z
      .object({ batchSize: z.number().int().min(1).max(50).default(10) })
      .parse(body);
    const workerName = `next-worker:${crypto.randomUUID()}`;
    const outbox = await processOutboxEvents(workerName, input.batchSize * 2);
    const integrations = await processIntegrationJobs(
      workerName,
      input.batchSize,
    );
    return NextResponse.json({
      processed: outbox.length + integrations.length,
      outbox,
      integrations,
    });
  } catch {
    return NextResponse.json(
      { error: "The durable queues could not be processed." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return processQueues(request, await request.json().catch(() => ({})));
}

export async function GET(request: Request) {
  return processQueues(request, {});
}

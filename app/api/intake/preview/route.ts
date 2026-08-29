import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyIncident } from "@/lib/ai/intake";
import { logEvent, logFailure } from "@/lib/observability";

const intakeInput = z.object({
  description: z.string().min(30).max(5000),
  amount: z.number().int().positive().max(10000000),
});

export async function POST(request: Request) {
  try {
    const input = intakeInput.parse(await request.json());
    const structured = classifyIncident(input.description);
    logEvent("intake.previewed", {
      amount: input.amount,
      classifier: "deterministic_fallback",
    });
    return NextResponse.json({
      amount: input.amount,
      structured,
    });
  } catch (error) {
    logFailure("intake.preview_failed", error, {
      classifier: "deterministic_fallback",
    });
    const message =
      error instanceof z.ZodError
        ? "Please describe what happened in at least 30 characters and enter a whole positive amount."
        : error instanceof Error
          ? error.message
          : "Unable to understand this report.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

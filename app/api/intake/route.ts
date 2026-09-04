import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createCase } from "@/lib/repository";
import { assertRateLimit } from "@/lib/rate-limit";
import { logFailure } from "@/lib/observability";

const intakeInput = z.object({
  description: z.string().min(30).max(5000),
  amount: z.number().int().positive().max(10000000),
  fraudType: z.string().min(2).max(120),
  paymentChannel: z.string().min(2).max(80),
  incidentAt: z.string().datetime(),
  transactionReference: z.string().max(120).optional(),
  institutionDetails: z.string().max(160).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireRole("citizen");
    await assertRateLimit("case-intake", 5, 600);
    const input = intakeInput.parse(await request.json());
    return NextResponse.json(
      await createCase({ ...input, userId: user.userId }),
    );
  } catch (error) {
    logFailure("case.creation_failed", error);
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Please describe what happened in at least 30 characters and enter a whole positive amount."
            : error instanceof Error
              ? error.message
              : "Unable to create case.",
      },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createCase } from "@/lib/repository";
import { assertRateLimit } from "@/lib/rate-limit";
import { logFailure } from "@/lib/observability";
import { reportDetailsSchema, reportNarrative } from "@/lib/report-details";

const intakeInput = z.object({
  description: z.string().trim().min(200).max(3000),
  details: reportDetailsSchema,
  syntheticOnly: z.literal(true),
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
    const description = reportNarrative(input.description, input.details);
    if (description.length > 5000)
      throw new Error(
        "Please shorten the report details to fit 5,000 characters in total.",
      );
    return NextResponse.json(
      await createCase({ ...input, description, userId: user.userId }),
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
            ? "Please provide at least 200 characters, incident location, bank, valid transaction date and amount, and confirm that all data is synthetic. Check optional email and website formats."
            : error instanceof Error
              ? error.message
              : "Unable to create case.",
      },
      { status: 400 },
    );
  }
}

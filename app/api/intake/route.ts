import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createCaseFromIntake } from "@/lib/case-engine";

const intakeInput = z.object({
  description: z.string().min(30).max(5000),
  amount: z.number().int().positive().max(10000000),
});

export async function POST(request: Request) {
  try {
    const user = await requireRole("citizen");
    const input = intakeInput.parse(await request.json());
    return NextResponse.json(
      createCaseFromIntake({ ...input, userId: user.userId }),
    );
  } catch (error) {
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

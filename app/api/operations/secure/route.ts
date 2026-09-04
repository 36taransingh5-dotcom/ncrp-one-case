import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { secureCaseFunds } from "@/lib/repository";
import { ensureDemoData } from "@/lib/demo";
import { isLocalBackend } from "@/lib/supabase/config";
import { assertRateLimit } from "@/lib/rate-limit";
export async function POST(request: Request) {
  try {
    if (isLocalBackend()) ensureDemoData();
    const user = await requireRole("operator");
    await assertRateLimit("operator-command", 60, 60);
    const input = z
      .object({
        caseId: z.string().regex(/^NCRP-\d{2}-\d{6}$/),
        amount: z.number().int().positive().max(100000),
        expectedVersion: z.number().int().nonnegative().default(0),
        idempotencyKey: z.string().uuid().optional(),
      })
      .parse(await request.json());
    const result = await secureCaseFunds({
      publicCaseId: input.caseId,
      actorId: user.userId,
      amount: input.amount,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
    });
    return NextResponse.json(result);
  } catch (error) {
    const unauthorised =
      error instanceof Error && error.message === "UNAUTHORIZED";
    const changed =
      error instanceof Error && error.message.includes("CASE_CHANGED");
    const message = unauthorised
      ? "Operator access is required."
      : changed
        ? "This case changed while you were working. Refresh it before securing funds."
        : error instanceof Error
          ? error.message
          : "Unable to process the action.";
    return NextResponse.json(
      { error: message },
      { status: unauthorised ? 401 : changed ? 409 : 400 },
    );
  }
}

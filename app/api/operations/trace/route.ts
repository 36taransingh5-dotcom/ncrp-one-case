import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { traceCaseMovement } from "@/lib/repository";
import { assertRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    await requireRole("operator");
    await assertRateLimit("operator-command", 60, 60);
    const input = z
      .object({
        caseId: z.string().regex(/^NCRP-\d{2}-\d{6}$/),
        movementId: z.string().uuid(),
        amount: z.number().int().positive().max(10_000_000),
        status: z.enum(["secured", "tracing", "unrecovered"]),
        institutionId: z.string().uuid().optional(),
        expectedVersion: z.number().int().nonnegative().default(0),
        idempotencyKey: z.string().uuid().optional(),
      })
      .parse(await request.json());
    const result = await traceCaseMovement({
      publicCaseId: input.caseId,
      movementId: input.movementId,
      amount: input.amount,
      status: input.status,
      institutionId: input.institutionId,
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
        ? "This case changed while you were working. Refresh it before splitting this movement."
        : error instanceof Error
          ? error.message
          : "Unable to process the action.";
    return NextResponse.json(
      { error: message },
      { status: unauthorised ? 401 : changed ? 409 : 400 },
    );
  }
}

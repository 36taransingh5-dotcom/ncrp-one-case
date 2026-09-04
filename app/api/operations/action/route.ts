import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { executeCaseAction } from "@/lib/repository";
import { ensureDemoData } from "@/lib/demo";
import { logFailure } from "@/lib/observability";
import { isLocalBackend } from "@/lib/supabase/config";
import { assertRateLimit } from "@/lib/rate-limit";

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("IDENTIFY_BENEFICIARY_BANK") }),
  z.object({ type: z.literal("SEND_FREEZE_REQUEST") }),
  z.object({ type: z.literal("MARK_FUNDS_MOVED") }),
  z.object({ type: z.literal("MARK_FUNDS_WITHDRAWN") }),
  z.object({ type: z.literal("ASSIGN_CYBER_CELL") }),
  z.object({ type: z.literal("START_INVESTIGATION") }),
  z.object({ type: z.literal("ACCEPT_EVIDENCE") }),
  z.object({ type: z.literal("START_FIR_REVIEW") }),
  z.object({ type: z.literal("REGISTER_FIR") }),
  z.object({ type: z.literal("ESCALATE_CASE") }),
  z.object({ type: z.literal("RESOLVE_CASE") }),
  z.object({ type: z.literal("CLOSE_CASE") }),
  z.object({
    type: z.literal("REQUEST_EVIDENCE"),
    title: z.string().min(3).max(100),
    description: z.string().min(10).max(500),
  }),
]);
export async function POST(request: Request) {
  try {
    if (isLocalBackend()) ensureDemoData();
    const user = await requireRole("operator");
    await assertRateLimit("operator-command", 60, 60);
    const body = await request.json();
    const caseId = z
      .string()
      .regex(/^NCRP-\d{2}-\d{6}$/)
      .parse(body.caseId);
    const action = actionSchema.parse(body.action);
    return NextResponse.json(
      await executeCaseAction({
        publicCaseId: caseId,
        actorId: user.userId,
        action,
        expectedVersion: z
          .number()
          .int()
          .nonnegative()
          .default(0)
          .parse(body.expectedVersion),
        idempotencyKey: z.string().uuid().optional().parse(body.idempotencyKey),
      }),
    );
  } catch (error) {
    logFailure("operator.command_http_failed", error);
    const unauthorised =
      error instanceof Error && error.message === "UNAUTHORIZED";
    const changed =
      error instanceof Error && error.message.includes("CASE_CHANGED");
    return NextResponse.json(
      {
        error: unauthorised
          ? "Operator access is required for this action. Re-enter the operations demo and try again."
          : changed
            ? "This case changed while you were working. Refresh it before applying the action again."
            : error instanceof Error
              ? error.message
              : "Unable to process this action.",
      },
      { status: unauthorised ? 401 : changed ? 409 : 400 },
    );
  }
}

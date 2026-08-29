import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { executeOperatorAction } from "@/lib/case-engine";
import { ensureDemoData } from "@/lib/demo";

const actionSchema = z.discriminatedUnion("type", [
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
    ensureDemoData();
    const user = await requireRole("operator");
    const body = await request.json();
    const caseId = z
      .string()
      .regex(/^NCRP-\d{2}-\d{6}$/)
      .parse(body.caseId);
    const action = actionSchema.parse(body.action);
    return NextResponse.json(
      await executeOperatorAction(caseId, user.userId, action),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process this action.",
      },
      { status: 400 },
    );
  }
}

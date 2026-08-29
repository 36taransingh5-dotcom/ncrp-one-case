import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { secureAdditionalFunds } from "@/lib/case-engine";
import { ensureDemoData } from "@/lib/demo";
export async function POST(request: Request) {
  try {
    ensureDemoData();
    const user = await requireRole("operator");
    const input = z
      .object({
        caseId: z.string().regex(/^NCRP-\d{2}-\d{6}$/),
        amount: z.number().int().positive().max(100000),
      })
      .parse(await request.json());
    const result = await secureAdditionalFunds(
      input.caseId,
      user.userId,
      input.amount,
    );
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error && error.message === "UNAUTHORIZED"
        ? "Operator access is required."
        : error instanceof Error
          ? error.message
          : "Unable to process the action.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

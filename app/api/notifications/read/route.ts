import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { getCaseDetail, markCaseNotificationsRead } from "@/lib/repository";
export async function POST(request: Request) {
  try {
    const user = await requireRole("citizen");
    const { caseId } = z
      .object({ caseId: z.string() })
      .parse(await request.json());
    const detail = await getCaseDetail(caseId);
    if (!detail || detail.citizen.user_id !== user.userId)
      throw new Error("CASE_NOT_FOUND");
    await markCaseNotificationsRead(
      user.userId,
      caseId,
      String(detail.case.id),
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Notifications could not be updated." },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { markNotificationsRead } from "@/lib/case-engine";
export async function POST(request: Request) {
  try {
    const user = await requireRole("citizen");
    const { caseId } = z
      .object({ caseId: z.string() })
      .parse(await request.json());
    markNotificationsRead(user.userId, caseId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Notifications could not be updated." },
      { status: 400 },
    );
  }
}

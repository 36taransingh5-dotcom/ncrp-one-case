import { NextResponse } from "next/server";
import { getCaseDetail } from "@/lib/repository";
import { currentSession } from "@/lib/auth";
import { ensureDemoData } from "@/lib/demo";
import { isLocalBackend } from "@/lib/supabase/config";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  if (isLocalBackend()) ensureDemoData();
  const session = await currentSession();
  if (!session)
    return NextResponse.json(
      { error: "Sign in to view this case." },
      { status: 401 },
    );
  const detail = await getCaseDetail(
    (await params).caseId,
    session.role === "operator",
  );
  if (!detail)
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  if (session.role === "citizen" && detail.citizen.user_id !== session.userId)
    return NextResponse.json(
      { error: "You do not have access to this case." },
      { status: 403 },
    );
  return NextResponse.json(detail);
}

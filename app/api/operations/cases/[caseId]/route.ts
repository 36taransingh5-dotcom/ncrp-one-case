import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { getCaseDetail } from "@/lib/repository";
import { ensureDemoData } from "@/lib/demo";
import { isLocalBackend } from "@/lib/supabase/config";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    if (isLocalBackend()) ensureDemoData();
    await requireRole("operator");
    const caseId = z
      .string()
      .regex(/^NCRP-\d{2}-\d{6}$/)
      .parse((await params).caseId);
    const detail = await getCaseDetail(caseId, true);
    return detail
      ? NextResponse.json(detail)
      : NextResponse.json({ error: "Case not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load case.",
      },
      { status: 400 },
    );
  }
}

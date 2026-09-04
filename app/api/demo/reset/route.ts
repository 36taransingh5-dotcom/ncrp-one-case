import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { seedDemo } from "@/lib/seed";
import { isLocalBackend } from "@/lib/supabase/config";

export async function POST() {
  if (!isLocalBackend())
    return NextResponse.json(
      { error: "Demo reset is disabled on the production backend." },
      { status: 404 },
    );
  try {
    await requireRole("operator");
    seedDemo(true);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Operator access is required." },
      { status: 403 },
    );
  }
}

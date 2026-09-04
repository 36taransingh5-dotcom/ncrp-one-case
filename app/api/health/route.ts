import { NextResponse } from "next/server";
import { isLocalBackend } from "@/lib/supabase/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isLocalBackend())
    return NextResponse.json({ status: "ok", backend: "local-demo" });
  try {
    const { error } = await createSupabaseAdminClient()
      .from("institutions")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) throw error;
    return NextResponse.json({ status: "ok", backend: "supabase" });
  } catch {
    return NextResponse.json(
      { status: "unavailable", backend: "supabase" },
      { status: 503 },
    );
  }
}

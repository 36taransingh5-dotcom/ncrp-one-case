import { NextResponse } from "next/server";
import { isLocalBackend } from "@/lib/supabase/config";
import { getIntegrationSnapshot } from "@/lib/adapters";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const integrations = getIntegrationSnapshot();
  if (isLocalBackend())
    return NextResponse.json({
      status: "ok",
      backend: "local-demo",
      integrations,
    });
  try {
    const { error } = await createSupabaseAdminClient()
      .from("institutions")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) throw error;
    return NextResponse.json({
      status: "ok",
      backend: "supabase",
      integrations,
    });
  } catch {
    return NextResponse.json(
      { status: "unavailable", backend: "supabase", integrations },
      { status: 503 },
    );
  }
}

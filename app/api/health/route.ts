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
      integrations: {
        ...integrations,
        email: integrations.notification,
      },
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
      integrations: {
        ...integrations,
        email: integrations.notification,
      },
    });
  } catch {
    return NextResponse.json(
      {
        status: "unavailable",
        backend: "supabase",
        integrations: {
          ...integrations,
          email: integrations.notification,
        },
      },
      { status: 503 },
    );
  }
}

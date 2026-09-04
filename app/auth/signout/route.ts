import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLocalBackend } from "@/lib/supabase/config";

export async function POST(request: Request) {
  if (!isLocalBackend()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set("ncrp_session", "", { expires: new Date(0), path: "/" });
  return response;
}

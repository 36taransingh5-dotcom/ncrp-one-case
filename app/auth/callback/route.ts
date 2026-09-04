import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLocalBackend } from "@/lib/supabase/config";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (isLocalBackend())
    return NextResponse.redirect(new URL("/auth", url.origin));
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const next =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/cases";
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/auth?error=callback", url.origin));
}

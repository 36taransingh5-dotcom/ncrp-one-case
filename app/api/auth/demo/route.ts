import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureDemoData } from "@/lib/demo";
import { issueSession } from "@/lib/auth";
import { logEvent, logFailure } from "@/lib/observability";
import { isDemoAccessEnabled, isLocalBackend } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    if (!isDemoAccessEnabled())
      return NextResponse.json(
        { error: "Demo-role sessions are disabled in production." },
        { status: 404 },
      );
    const { role, demo } = z
      .object({
        role: z.enum(["citizen", "operator"]),
        demo: z.enum(["golden", "showcase"]).default("golden"),
      })
      .parse(await request.json());
    if (demo === "showcase" && (role !== "citizen" || isLocalBackend()))
      return NextResponse.json(
        { error: "The showcase citizen is unavailable in this environment." },
        { status: 404 },
      );
    const redirect =
      role === "operator"
        ? "/operations"
        : demo === "showcase"
          ? "/case/NCRP-26-926184"
          : "/case/NCRP-26-847193";
    if (!isLocalBackend()) {
      const email =
        role === "operator"
          ? process.env.NCRP_DEMO_OPERATOR_EMAIL
          : demo === "showcase"
            ? process.env.NCRP_SHOWCASE_CITIZEN_EMAIL
            : process.env.NCRP_DEMO_CITIZEN_EMAIL;
      const password =
        role === "operator"
          ? process.env.NCRP_DEMO_OPERATOR_PASSWORD
          : demo === "showcase"
            ? process.env.NCRP_SHOWCASE_CITIZEN_PASSWORD
            : process.env.NCRP_DEMO_CITIZEN_PASSWORD;
      if (!email || !password)
        throw new Error("Demo identity is not configured.");
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.user) throw error || new Error("Demo sign-in failed.");
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      if (profile?.role !== role) {
        await supabase.auth.signOut();
        throw new Error("Demo identity has the wrong role.");
      }
      logEvent("auth.demo_session_issued", {
        actorId: data.user.id,
        role,
        demo,
      });
      return NextResponse.json({ ok: true, redirect });
    }
    ensureDemoData();
    const user = db
      .prepare(
        "SELECT id,role FROM users WHERE role=? ORDER BY created_at LIMIT 1",
      )
      .get(role) as { id: string; role: "citizen" | "operator" };
    const res = NextResponse.json({
      ok: true,
      redirect,
    });
    res.cookies.set("ncrp_session", issueSession(user.id, user.role), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    logEvent("auth.demo_session_issued", { actorId: user.id, role });
    return res;
  } catch (error) {
    logFailure("auth.demo_session_failed", error);
    return NextResponse.json(
      { error: "Unable to start the demo session. Please try again." },
      { status: 400 },
    );
  }
}

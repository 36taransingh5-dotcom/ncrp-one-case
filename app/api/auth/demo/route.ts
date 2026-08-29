import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureDemoData } from "@/lib/demo";
import { issueSession } from "@/lib/auth";
import { logEvent, logFailure } from "@/lib/observability";

export async function POST(request: Request) {
  try {
    const { role } = z
      .object({ role: z.enum(["citizen", "operator"]) })
      .parse(await request.json());
    ensureDemoData();
    const user = db
      .prepare(
        "SELECT id,role FROM users WHERE role=? ORDER BY created_at LIMIT 1",
      )
      .get(role) as { id: string; role: "citizen" | "operator" };
    const res = NextResponse.json({
      ok: true,
      redirect: role === "operator" ? "/operations" : "/case/NCRP-26-847193",
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

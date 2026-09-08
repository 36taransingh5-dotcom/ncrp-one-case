import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { requireRole } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  DIGILOCKER_PKCE_COOKIE,
  createPkcePair,
  getDigiLockerAdapter,
  signOauthState,
} from "@/lib/adapters/identity";

export const dynamic = "force-dynamic";

function cookieBase() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireRole("citizen");
    await assertRateLimit("digilocker-start", 8, 600);
    const caseId = z
      .string()
      .regex(/^NCRP-\d{2}-\d{6}$/)
      .parse(new URL(request.url).searchParams.get("caseId"));
    const adapter = getDigiLockerAdapter();
    if (!adapter.isEnabled())
      return NextResponse.json(
        { error: "DigiLocker requester credentials are not configured." },
        { status: 404 },
      );
    const { verifier, challenge } = createPkcePair();
    const state = signOauthState({
      userId: user.userId,
      caseId,
      nonce: crypto.randomBytes(16).toString("hex"),
    });
    const location = adapter.authorizationUrl(state, challenge);
    if (!location)
      return NextResponse.json(
        { error: "DigiLocker authorization is unavailable." },
        { status: 404 },
      );
    const response = NextResponse.redirect(location);
    response.cookies.set(DIGILOCKER_PKCE_COOKIE, verifier, cookieBase());
    return response;
  } catch (error) {
    const unauthorised =
      error instanceof Error && error.message === "UNAUTHORIZED";
    return NextResponse.json(
      {
        error: unauthorised
          ? "Sign in as the case citizen to connect DigiLocker."
          : error instanceof Error
            ? error.message
            : "DigiLocker could not be started.",
      },
      { status: unauthorised ? 401 : 400 },
    );
  }
}

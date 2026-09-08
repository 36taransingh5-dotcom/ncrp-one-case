import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  DIGILOCKER_PKCE_COOKIE,
  DIGILOCKER_TOKEN_COOKIE,
  encryptSecret,
  getDigiLockerAdapter,
  verifyOauthState,
} from "@/lib/adapters/identity";
import { currentSession } from "@/lib/auth";
import { logFailure } from "@/lib/observability";

export const dynamic = "force-dynamic";

function casePath(caseId: string, query: string) {
  return `/case/${encodeURIComponent(caseId)}?${query}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const parsed = verifyOauthState(state);
  const fallbackCase = parsed?.caseId || "";
  if (error) {
    return NextResponse.redirect(
      new URL(
        fallbackCase
          ? casePath(fallbackCase, "digilocker=denied")
          : "/cases?digilocker=denied",
        url.origin,
      ),
    );
  }
  try {
    const session = await currentSession();
    if (!session || session.role !== "citizen" || !parsed)
      throw new Error("DigiLocker authorization was invalid or expired.");
    if (parsed.userId !== session.userId)
      throw new Error("DigiLocker authorization belonged to another session.");
    const codeVerifier =
      (await cookies()).get(DIGILOCKER_PKCE_COOKIE)?.value || "";
    if (!code || !codeVerifier)
      throw new Error("DigiLocker did not return a usable authorization code.");
    const token = await getDigiLockerAdapter().exchangeCode(code, codeVerifier);
    const response = NextResponse.redirect(
      new URL(casePath(parsed.caseId, "digilocker=connected"), url.origin),
    );
    response.cookies.set(DIGILOCKER_PKCE_COOKIE, "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });
    response.cookies.set(
      DIGILOCKER_TOKEN_COOKIE,
      encryptSecret(
        JSON.stringify({
          accessToken: token.accessToken,
          expiresAt: token.expiresAt,
          userId: session.userId,
          caseId: parsed.caseId,
        }),
      ),
      {
        httpOnly: true,
        sameSite: "lax",
        secure:
          process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
        path: "/",
        maxAge: Math.max(60, Math.floor((token.expiresAt - Date.now()) / 1000)),
      },
    );
    return response;
  } catch (caught) {
    logFailure("digilocker.callback_failed", caught);
    return NextResponse.redirect(
      new URL(
        fallbackCase
          ? casePath(fallbackCase, "digilocker=error")
          : "/cases?digilocker=error",
        url.origin,
      ),
    );
  }
}

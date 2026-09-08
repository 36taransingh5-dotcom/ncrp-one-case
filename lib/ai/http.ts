import { NextResponse } from "next/server";
import { z } from "zod";

export function aiError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const status =
    code === "UNAUTHORIZED"
      ? 401
      : code === "RATE_LIMITED"
        ? 429
        : error instanceof z.ZodError
          ? 400
          : 503;
  return NextResponse.json(
    {
      error:
        status === 401
          ? "Sign in with the required role to use this feature."
          : status === 429
            ? "Too many analysis requests. Please try again later."
            : status === 400
              ? "Please check the analysis input."
              : "AI analysis is temporarily unavailable. You can continue normally.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

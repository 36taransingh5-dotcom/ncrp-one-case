import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireRole } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  DIGILOCKER_TOKEN_COOKIE,
  getDigiLockerAdapter,
  parseDigiLockerTokenCookie,
} from "@/lib/adapters/identity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireRole("citizen");
    await assertRateLimit("digilocker-files", 20, 60);
    const caseId = new URL(request.url).searchParams.get("caseId") || "";
    const accessToken = parseDigiLockerTokenCookie(
      (await cookies()).get(DIGILOCKER_TOKEN_COOKIE)?.value,
      user.userId,
      caseId,
    );
    if (!accessToken)
      return NextResponse.json(
        { error: "Connect DigiLocker first.", connected: false },
        { status: 401 },
      );
    const items = await getDigiLockerAdapter().listIssuedDocuments(accessToken);
    return NextResponse.json({
      connected: true,
      items: items.map((item) => ({
        name: item.name,
        uri: item.uri,
        description: item.description,
        issuer: item.issuer,
        mime: item.mime,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "DigiLocker documents could not be listed." },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { currentSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ evidenceId: string }> },
) {
  const session = await currentSession();
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const evidence = db
    .prepare(
      "SELECT e.*,c.user_id owner_user_id FROM evidence e JOIN cases k ON k.id=e.case_id JOIN citizens c ON c.id=k.citizen_id WHERE e.id=?",
    )
    .get((await params).evidenceId) as Record<string, unknown> | undefined;
  if (!evidence)
    return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
  if (session.role === "citizen" && evidence.owner_user_id !== session.userId)
    return NextResponse.json(
      { error: "Evidence is unavailable to this account." },
      { status: 403 },
    );
  const uploadDir = path.resolve(
    /* turbopackIgnore: true */ process.env.NCRP_UPLOAD_DIR ||
      (process.env.VERCEL
        ? "/tmp/ncrp-one-case-uploads"
        : path.join(process.cwd(), "uploads")),
  );
  const filePath = path.resolve(uploadDir, String(evidence.storage_path));
  if (!filePath.startsWith(`${uploadDir}${path.sep}`))
    return NextResponse.json(
      { error: "Invalid evidence path." },
      { status: 400 },
    );
  try {
    const bytes = await fs.readFile(/* turbopackIgnore: true */ filePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": String(evidence.mime_type),
        "Content-Length": String(bytes.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(evidence.title))}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "The stored file is unavailable. Reset the demo or upload it again.",
      },
      { status: 404 },
    );
  }
}

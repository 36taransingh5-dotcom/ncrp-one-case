import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { createEvidence } from "@/lib/case-engine";
const MAX_SIZE = 8 * 1024 * 1024,
  allowed = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "text/plain",
  ]);
export async function POST(request: Request) {
  try {
    const user = await requireRole("citizen");
    const form = await request.formData();
    const caseId = z.string().parse(form.get("caseId"));
    const title = z.string().min(2).max(120).parse(form.get("title"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose a file to upload.");
    if (!allowed.has(file.type))
      throw new Error("Use a PDF, PNG, JPG or text file.");
    if (file.size > MAX_SIZE) throw new Error("Files must be 8 MB or smaller.");
    const caseRow = db
      .prepare(
        "SELECT k.id FROM cases k JOIN citizens c ON c.id=k.citizen_id WHERE k.public_case_id=? AND c.user_id=?",
      )
      .get(caseId, user.userId) as { id: string } | undefined;
    if (!caseRow)
      throw new Error("Case not found or unavailable to this citizen.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
    const uploadDir =
      process.env.NCRP_UPLOAD_DIR || path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    const filename = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storedFilePath = path.join(uploadDir, filename);
    await fs.writeFile(storedFilePath, bytes);
    try {
      createEvidence({
        caseId: caseRow.id,
        userId: user.userId,
        type: "financial",
        title,
        path: filename,
        mime: file.type,
        size: file.size,
        sha256: checksum,
      });
    } catch (error) {
      await fs.unlink(storedFilePath).catch(() => undefined);
      throw error;
    }
    return NextResponse.json({ ok: true, sha256: checksum });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Upload failed. Please retry.",
      },
      { status: 400 },
    );
  }
}

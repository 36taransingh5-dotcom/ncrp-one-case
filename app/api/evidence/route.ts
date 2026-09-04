import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { createEvidence } from "@/lib/case-engine";
import { logEvent, logFailure } from "@/lib/observability";
import { isLocalBackend } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertRateLimit } from "@/lib/rate-limit";
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
    await assertRateLimit("evidence-upload", 15, 600);
    const form = await request.formData();
    const caseId = z.string().parse(form.get("caseId"));
    const title = z.string().min(2).max(120).parse(form.get("title"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose a file to upload.");
    if (file.size === 0) throw new Error("The selected file is empty.");
    if (!allowed.has(file.type))
      throw new Error("Use a PDF, PNG, JPG or text file.");
    if (file.size > MAX_SIZE) throw new Error("Files must be 8 MB or smaller.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const validSignature =
      (file.type === "application/pdf" &&
        bytes.subarray(0, 5).toString() === "%PDF-") ||
      (file.type === "image/png" &&
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (file.type === "image/jpeg" &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff) ||
      (file.type === "text/plain" && !bytes.subarray(0, 4096).includes(0));
    if (!validSignature)
      throw new Error("The file content does not match its reported type.");
    if (!isLocalBackend()) {
      const supabase = await createSupabaseServerClient();
      const { data: caseRow, error: caseError } = await supabase
        .from("cases")
        .select("id")
        .eq("public_case_id", caseId)
        .single();
      if (caseError || !caseRow)
        throw new Error("Case not found or unavailable to this citizen.");
      const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storageKey = `${user.userId}/${caseRow.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("case-evidence")
        .upload(storageKey, bytes, { contentType: file.type, upsert: false });
      if (uploadError)
        throw new Error(
          "Private evidence storage rejected the upload. Please retry.",
        );
      const { error: metadataError } = await supabase.rpc(
        "record_evidence_upload",
        {
          p_case_id: caseRow.id,
          p_title: title,
          p_evidence_type: "financial",
          p_storage_key: storageKey,
          p_original_filename: safeName,
          p_content_type: file.type,
          p_file_size: file.size,
          p_sha256: checksum,
        },
      );
      if (metadataError) {
        await createSupabaseAdminClient()
          .storage.from("case-evidence")
          .remove([storageKey]);
        throw new Error(
          "Evidence metadata could not be recorded. The upload was rolled back.",
        );
      }
      logEvent("evidence.uploaded", {
        caseId: String(caseRow.id),
        actorId: user.userId,
        mime: file.type,
        size: file.size,
      });
      return NextResponse.json({ ok: true, sha256: checksum });
    }
    const caseRow = db
      .prepare(
        "SELECT k.id FROM cases k JOIN citizens c ON c.id=k.citizen_id WHERE k.public_case_id=? AND c.user_id=?",
      )
      .get(caseId, user.userId) as { id: string } | undefined;
    if (!caseRow)
      throw new Error("Case not found or unavailable to this citizen.");
    const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
    const uploadDir =
      process.env.NCRP_UPLOAD_DIR ||
      (process.env.VERCEL
        ? "/tmp/ncrp-one-case-uploads"
        : path.join(process.cwd(), "uploads"));
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
    logEvent("evidence.uploaded", {
      caseId: caseRow.id,
      actorId: user.userId,
      mime: file.type,
      size: file.size,
    });
    return NextResponse.json({ ok: true, sha256: checksum });
  } catch (error) {
    logFailure("evidence.upload_failed", error);
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

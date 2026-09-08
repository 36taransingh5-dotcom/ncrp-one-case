import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { requireRole } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { createEvidence } from "@/lib/case-engine";
import { isLocalBackend } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DIGILOCKER_TOKEN_COOKIE,
  getDigiLockerAdapter,
  parseDigiLockerTokenCookie,
} from "@/lib/adapters/identity";
import { logEvent, logFailure } from "@/lib/observability";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const allowed = new Set(["application/pdf", "image/png", "image/jpeg"]);

export async function POST(request: Request) {
  try {
    const user = await requireRole("citizen");
    await assertRateLimit("digilocker-import", 8, 600);
    const body = z
      .object({
        caseId: z.string().regex(/^NCRP-\d{2}-\d{6}$/),
        uri: z.string().min(8).max(300),
        name: z.string().min(2).max(120),
      })
      .parse(await request.json());
    const accessToken = parseDigiLockerTokenCookie(
      (await cookies()).get(DIGILOCKER_TOKEN_COOKIE)?.value,
      user.userId,
      body.caseId,
    );
    if (!accessToken)
      return NextResponse.json(
        { error: "Connect DigiLocker first." },
        { status: 401 },
      );
    const file = await getDigiLockerAdapter().downloadFile(
      accessToken,
      body.uri,
    );
    const contentType = allowed.has(file.contentType)
      ? file.contentType
      : file.bytes.subarray(0, 5).toString() === "%PDF-"
        ? "application/pdf"
        : "";
    if (
      !contentType ||
      file.bytes.length === 0 ||
      file.bytes.length > 8 * 1024 * 1024
    )
      throw new Error("That DigiLocker file cannot be attached to this case.");
    const checksum = crypto
      .createHash("sha256")
      .update(file.bytes)
      .digest("hex");
    const title = `DigiLocker: ${body.name}`.slice(0, 120);
    const safeName = body.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const filename = `${crypto.randomUUID()}-${safeName}`;
    if (!isLocalBackend()) {
      const supabase = await createSupabaseServerClient();
      const { data: caseRow, error: caseError } = await supabase
        .from("cases")
        .select("id")
        .eq("public_case_id", body.caseId)
        .single();
      if (caseError || !caseRow)
        throw new Error("Case not found or unavailable to this citizen.");
      const storageKey = `${user.userId}/${caseRow.id}/${filename}`;
      const { error: uploadError } = await supabase.storage
        .from("case-evidence")
        .upload(storageKey, file.bytes, {
          contentType,
          upsert: false,
        });
      if (uploadError)
        throw new Error(
          "Private evidence storage rejected the DigiLocker file.",
        );
      const { error: metadataError } = await supabase.rpc(
        "record_evidence_upload",
        {
          p_case_id: caseRow.id,
          p_title: title,
          p_evidence_type: "identity",
          p_storage_key: storageKey,
          p_original_filename: safeName,
          p_content_type: contentType,
          p_file_size: file.bytes.length,
          p_sha256: checksum,
        },
      );
      if (metadataError) {
        await createSupabaseAdminClient()
          .storage.from("case-evidence")
          .remove([storageKey]);
        throw new Error("Evidence metadata could not be recorded.");
      }
      logEvent("evidence.uploaded", {
        caseId: String(caseRow.id),
        actorId: user.userId,
        mime: contentType,
        size: file.bytes.length,
        operation: "digilocker.import",
      });
      return NextResponse.json({ ok: true, sha256: checksum });
    }
    const caseRow = db
      .prepare(
        "SELECT k.id FROM cases k JOIN citizens c ON c.id=k.citizen_id WHERE k.public_case_id=? AND c.user_id=?",
      )
      .get(body.caseId, user.userId) as { id: string } | undefined;
    if (!caseRow)
      throw new Error("Case not found or unavailable to this citizen.");
    const uploadDir =
      process.env.NCRP_UPLOAD_DIR ||
      (process.env.VERCEL
        ? "/tmp/ncrp-one-case-uploads"
        : path.join(process.cwd(), "uploads"));
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), file.bytes);
    createEvidence({
      caseId: caseRow.id,
      userId: user.userId,
      type: "identity",
      title,
      path: filename,
      mime: contentType,
      size: file.bytes.length,
      sha256: checksum,
    });
    logEvent("evidence.uploaded", {
      caseId: caseRow.id,
      actorId: user.userId,
      mime: contentType,
      size: file.bytes.length,
      operation: "digilocker.import",
    });
    return NextResponse.json({ ok: true, sha256: checksum });
  } catch (error) {
    logFailure("digilocker.import_failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The DigiLocker document could not be imported.",
      },
      { status: 400 },
    );
  }
}

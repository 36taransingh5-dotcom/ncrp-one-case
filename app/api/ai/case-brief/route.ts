import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { getCaseDetail } from "@/lib/repository";
import { analyseCaseContent } from "@/lib/ai/case-intelligence";
import { aiError } from "@/lib/ai/http";
import { isLocalBackend } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    await requireRole("operator");
    await assertRateLimit("ai-brief", 6, 600);
    const { caseId } = z
      .object({ caseId: z.string().regex(/^NCRP-\d{2}-\d{6}$/) })
      .strict()
      .parse(await request.json());
    const detail = await getCaseDetail(caseId);
    if (!detail)
      return Response.json({ error: "Case unavailable." }, { status: 404 });
    const transactions = isLocalBackend()
      ? db
          .prepare(
            "SELECT transaction_ref,amount,source_identifier_masked,destination_identifier_masked FROM transactions WHERE case_id=?",
          )
          .all(String(detail.case.id))
      : await (async () => {
          const client = await createSupabaseServerClient();
          const { data, error } = await client
            .from("transactions")
            .select(
              "transaction_ref,amount,source_identifier_masked,destination_identifier_masked",
            )
            .eq("case_id", detail.case.id);
          if (error) throw new Error("AI_UNAVAILABLE");
          return data;
        })();
    const content = JSON.stringify({
      transactions,
      complaint: detail.incident.raw_description,
      confirmed: {
        amount: detail.case.reported_amount,
        fraudType: detail.incident.fraud_type,
        paymentChannel: detail.incident.payment_channel,
        incidentAt: detail.incident.incident_at,
      },
      state: detail.case.case_status,
      secured: detail.case.secured_amount,
      tracing: detail.case.tracing_amount,
      events: detail.events.slice(0, 30).map((e) => e.event_type),
      documents: detail.evidence.map((e) => ({ title: e.title })),
      requests: detail.evidenceRequests.map((e) => ({
        title: e.title,
        status: e.status,
      })),
      firStatus: detail.fir?.fir_status,
    });
    return Response.json(await analyseCaseContent(content), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return aiError(error);
  }
}

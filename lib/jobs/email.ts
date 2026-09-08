import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isMissingRelation } from "./event-jobs";
import { getNotificationProvider } from "@/lib/adapters/config";
import { logFailure } from "@/lib/observability";

export async function resolveCitizenEmail(caseId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, public_case_id, citizen_id")
    .eq("id", caseId)
    .maybeSingle();
  if (!caseRow) return null;
  const { data: citizen } = await supabase
    .from("citizens")
    .select("user_id")
    .eq("id", caseRow.citizen_id)
    .maybeSingle();
  if (!citizen?.user_id) return null;
  const { data, error } = await supabase.auth.admin.getUserById(
    String(citizen.user_id),
  );
  if (error || !data.user?.email) return null;
  return {
    email: data.user.email,
    publicCaseId: String(caseRow.public_case_id),
    userId: String(citizen.user_id),
  };
}

export async function recordEmailDelivery(input: {
  outboxEventId: string;
  caseId: string;
  recipient: string;
  template: string;
  status: string;
  attemptCount: number;
  messageId?: string;
  lastError?: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  const row = {
    outbox_event_id: input.outboxEventId,
    case_id: input.caseId,
    provider: getNotificationProvider(),
    message_id: input.messageId || null,
    recipient: input.recipient,
    template: input.template,
    status: input.status,
    attempt_count: input.attemptCount,
    sent_at: input.status === "sent" ? new Date().toISOString() : null,
    last_error: input.lastError || null,
  };
  const { error } = await supabase.from("email_deliveries").upsert(row, {
    onConflict: "outbox_event_id",
  });
  if (error && !isMissingRelation(error, "email_deliveries"))
    logFailure("email.delivery_record_failed", error, { caseId: input.caseId });
}

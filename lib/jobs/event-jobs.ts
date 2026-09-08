export type CaseEventJobSpec = {
  provider: "bank" | "police" | "reporting" | "notification";
  action: string;
  idempotencyKey: (caseId: string) => string;
};

/** Same keys as supabase/migrations/012_http_integrations.sql. */
export const CASE_EVENT_INTEGRATION_JOBS: Record<string, CaseEventJobSpec[]> = {
  CASE_CREATED: [
    {
      provider: "reporting",
      action: "create_external_complaint",
      idempotencyKey: (caseId) => `reporting:complaint:${caseId}`,
    },
  ],
  BENEFICIARY_BANK_IDENTIFIED: [
    {
      provider: "bank",
      action: "identify_beneficiary",
      idempotencyKey: (caseId) => `bank:identify:${caseId}`,
    },
    {
      provider: "bank",
      action: "notify_fraud",
      idempotencyKey: (caseId) => `bank:notify:${caseId}`,
    },
  ],
};

export function jobsForCaseEvent(eventType: string) {
  return CASE_EVENT_INTEGRATION_JOBS[eventType] || [];
}

export function isMissingRelation(
  error: { code?: string; message?: string } | null | undefined,
  relation: string,
) {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const message = error.message || "";
  return (
    new RegExp(relation, "i").test(message) &&
    /does not exist|could not find|schema cache/i.test(message)
  );
}

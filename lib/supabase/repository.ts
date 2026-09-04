import "server-only";

import crypto from "node:crypto";
import type { CaseDetail, CaseListRow } from "@/lib/types";
import { calculateSlaTiming } from "@/lib/domain/sla";
import { createSupabaseServerClient } from "./server";

type Row = Record<string, unknown>;

function fail(error: { message: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

function relationName(value: unknown) {
  if (Array.isArray(value))
    return String((value[0] as Row | undefined)?.name || "");
  return String((value as Row | null)?.name || "");
}

function getSla(events: Row[]) {
  const request = events.find(
    (event) => event.event_type === "FREEZE_REQUEST_CREATED",
  );
  if (!request)
    return { status: "not_applicable", label: "No active institutional SLA" };
  const response = events.find(
    (event) =>
      [
        "AGENCY_ACKNOWLEDGED",
        "FUNDS_PARTIALLY_SECURED",
        "FUNDS_SECURED",
      ].includes(String(event.event_type)) &&
      new Date(String(event.occurred_at)) >=
        new Date(String(request.occurred_at)),
  );
  const breach = events.find((event) => event.event_type === "SLA_BREACHED");
  const timing = calculateSlaTiming({
    requestedAt: String(request.occurred_at),
    respondedAt: response ? String(response.occurred_at) : undefined,
    breachedAt: breach ? String(breach.occurred_at) : undefined,
  });
  const labels = {
    met: "Beneficiary-bank response received",
    breached: "Response overdue — escalation active",
    overdue: "Response overdue — escalation pending",
    waiting: "Waiting for beneficiary-bank response",
  };
  return {
    status: timing.status,
    label: labels[timing.status],
    requestedAt: request.occurred_at,
    deadlineAt: timing.deadlineAt,
    respondedAt: response?.occurred_at,
    breachedAt: breach?.occurred_at,
  };
}

export async function getSupabaseCaseDetail(
  publicCaseId: string,
  includeAudits = false,
): Promise<CaseDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: caseRow, error } = await supabase
    .from("cases")
    .select("*")
    .eq("public_case_id", publicCaseId)
    .maybeSingle();
  if (error) fail(error, "Case could not be loaded.");
  if (!caseRow) return null;
  const caseId = String(caseRow.id);
  const [
    citizen,
    incident,
    events,
    movements,
    evidence,
    requests,
    assignments,
    fir,
    notifications,
    audits,
  ] = await Promise.all([
    supabase
      .from("citizens")
      .select("*,profile:profiles!user_id(display_name)")
      .eq("id", caseRow.citizen_id)
      .single(),
    supabase.from("incidents").select("*").eq("case_id", caseId).single(),
    supabase
      .from("case_events")
      .select("*,institution:institutions(name)")
      .eq("case_id", caseId)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("fund_movements")
      .select(
        "*,source:transactions!source_transaction_id(source_identifier_masked),destination:transactions!destination_transaction_id(destination_identifier_masked)",
      )
      .eq("case_id", caseId)
      .order("occurred_at"),
    supabase
      .from("evidence")
      .select("*")
      .eq("case_id", caseId)
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("evidence_requests")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
    supabase
      .from("agency_assignments")
      .select("*,institution:institutions(name)")
      .eq("case_id", caseId)
      .order("assigned_at"),
    supabase
      .from("fir_records")
      .select("*")
      .eq("case_id", caseId)
      .maybeSingle(),
    supabase
      .from("notifications")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
    includeAudits
      ? supabase
          .from("audit_logs")
          .select("*,actor:profiles!actor_user_id(display_name)")
          .eq("resource_id", caseId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [
    citizen,
    incident,
    events,
    movements,
    evidence,
    requests,
    assignments,
    fir,
    notifications,
    audits,
  ]) {
    if (result.error)
      fail(result.error, "Related case data could not be loaded.");
  }
  const eventRows = (events.data || []).map((row: Row) => ({
    ...row,
    institution_name: relationName(row.institution),
  }));
  return {
    case: caseRow,
    citizen: {
      ...(citizen.data as Row),
      display_name: String(
        ((citizen.data as Row).profile as Row | null)?.display_name || "",
      ),
    },
    incident: incident.data as Row,
    events: eventRows,
    movements: (movements.data || []).map((row: Row) => ({
      ...row,
      source_account: String(
        (row.source as Row | null)?.source_identifier_masked || "",
      ),
      destination_account: String(
        (row.destination as Row | null)?.destination_identifier_masked || "",
      ),
    })),
    evidence: (evidence.data || []) as Row[],
    evidenceRequests: (requests.data || []) as Row[],
    assignments: (assignments.data || []).map((row: Row) => ({
      ...row,
      institution_name: relationName(row.institution),
    })),
    fir: (fir.data || {}) as Row,
    notifications: (notifications.data || []) as Row[],
    sla: getSla(eventRows),
    ...(includeAudits
      ? {
          audits: (audits.data || []).map((row: Row) => ({
            ...row,
            actor_name: String(
              (row.actor as Row | null)?.display_name || "Operator",
            ),
          })),
        }
      : {}),
  };
}

export async function listSupabaseCases(): Promise<CaseListRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cases")
    .select(
      "*,citizen:citizens(full_name),assignments:agency_assignments(assigned_operator_id,status)",
    )
    .order("last_activity_at", { ascending: false });
  if (error) fail(error, "Operations queue could not be loaded.");
  return (data || []).map((value) => {
    const row = value as Row;
    const assignments = (row.assignments || []) as Row[];
    const activeAssignment = assignments.find((assignment) =>
      ["assigned", "acknowledged", "active"].includes(
        String(assignment.status),
      ),
    );
    return {
      ...row,
      id: String(row.id),
      public_case_id: String(row.public_case_id),
      case_status: String(row.case_status),
      current_stage: String(row.current_stage),
      current_owner_name: String(row.current_owner_name || "Coordination desk"),
      priority: String(row.priority),
      reported_amount: Number(row.reported_amount),
      full_name: String((row.citizen as Row | null)?.full_name || "Citizen"),
      assigned_operator_id: activeAssignment?.assigned_operator_id
        ? String(activeAssignment.assigned_operator_id)
        : null,
    };
  });
}

export async function createSupabaseCase(input: {
  description: string;
  amount: number;
  fraudType: string;
  paymentChannel: string;
  incidentAt: string;
  transactionReference?: string;
  institutionDetails?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_case", {
    p_description: input.description,
    p_amount: input.amount,
    p_fraud_type: input.fraudType,
    p_payment_channel: input.paymentChannel,
    p_incident_at: input.incidentAt,
    p_transaction_reference: input.transactionReference || null,
    p_institution_details: input.institutionDetails || null,
  });
  if (error) fail(error, "Case could not be created.");
  return { publicId: String(data) };
}

export async function executeSupabaseCommand(input: {
  publicCaseId: string;
  action: string;
  expectedVersion: number;
  payload?: Row;
  idempotencyKey?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("execute_case_command", {
    p_public_case_id: input.publicCaseId,
    p_action: input.action,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
    p_payload: input.payload || {},
  });
  if (error) fail(error, "Operator command failed.");
  return getSupabaseCaseDetail(input.publicCaseId, true);
}

export async function markSupabaseNotificationsRead(
  userId: string,
  caseId: string,
) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("case_id", caseId)
    .is("read_at", null);
  if (error) fail(error, "Notifications could not be updated.");
}

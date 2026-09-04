import "server-only";

import type { OperatorAction } from "@/lib/case-engine";
import type { CaseListRow } from "@/lib/types";
import {
  createCaseFromIntake,
  executeOperatorAction,
  getCaseByPublicId,
  markNotificationsRead,
  secureAdditionalFunds,
} from "@/lib/case-engine";
import { db } from "@/lib/db";
import { isLocalBackend } from "@/lib/supabase/config";
import {
  createSupabaseCase,
  executeSupabaseCommand,
  getSupabaseCaseDetail,
  listSupabaseCases,
  markSupabaseNotificationsRead,
} from "@/lib/supabase/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getCaseDetail(
  publicCaseId: string,
  includeAudits = false,
) {
  return isLocalBackend()
    ? getCaseByPublicId(publicCaseId, includeAudits)
    : getSupabaseCaseDetail(publicCaseId, includeAudits);
}

export async function listOperationsCases(): Promise<CaseListRow[]> {
  if (!isLocalBackend()) return listSupabaseCases();
  const rows = db
    .prepare(
      "SELECT k.*,c.full_name FROM cases k JOIN citizens c ON c.id=k.citizen_id ORDER BY CASE k.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,k.last_activity_at DESC",
    )
    .all() as CaseListRow[];
  return rows.map((row) => ({ ...row }));
}

export async function listCitizenCases(userId: string): Promise<CaseListRow[]> {
  if (isLocalBackend())
    return db
      .prepare(
        "SELECT k.*,i.fraud_type FROM cases k JOIN citizens c ON c.id=k.citizen_id LEFT JOIN incidents i ON i.case_id=k.id WHERE c.user_id=? ORDER BY k.last_activity_at DESC",
      )
      .all(userId) as CaseListRow[];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cases")
    .select("*,incident:incidents(fraud_type)")
    .order("last_activity_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((value) => {
    const row = value as Record<string, unknown>;
    return {
      ...row,
      id: String(row.id),
      public_case_id: String(row.public_case_id),
      case_status: String(row.case_status),
      current_stage: String(row.current_stage),
      current_owner_name: String(row.current_owner_name || "Coordination desk"),
      priority: String(row.priority),
      reported_amount: Number(row.reported_amount),
      fraud_type: String(
        (
          (Array.isArray(row.incident) ? row.incident[0] : row.incident) as
            Record<string, unknown> | undefined
        )?.fraud_type || "Financial cyber fraud",
      ),
    };
  });
}

export async function createCase(input: {
  userId: string;
  description: string;
  amount: number;
  fraudType: string;
  paymentChannel: string;
  incidentAt: string;
  transactionReference?: string;
  institutionDetails?: string;
}) {
  if (!isLocalBackend()) return createSupabaseCase(input);
  return createCaseFromIntake(input);
}

export async function executeCaseAction(input: {
  publicCaseId: string;
  actorId: string;
  action: OperatorAction;
  expectedVersion: number;
  idempotencyKey?: string;
}) {
  if (isLocalBackend())
    return executeOperatorAction(
      input.publicCaseId,
      input.actorId,
      input.action,
    );
  const { type, ...payload } = input.action;
  return executeSupabaseCommand({
    publicCaseId: input.publicCaseId,
    action: type,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    payload,
  });
}

export async function secureCaseFunds(input: {
  publicCaseId: string;
  actorId: string;
  amount: number;
  expectedVersion: number;
  idempotencyKey?: string;
}) {
  return isLocalBackend()
    ? secureAdditionalFunds(input.publicCaseId, input.actorId, input.amount)
    : executeSupabaseCommand({
        publicCaseId: input.publicCaseId,
        action: "SECURE_ADDITIONAL_FUNDS",
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        payload: { amount: input.amount },
      });
}

export async function markCaseNotificationsRead(
  userId: string,
  publicCaseId: string,
  internalCaseId: string,
) {
  return isLocalBackend()
    ? markNotificationsRead(userId, publicCaseId)
    : markSupabaseNotificationsRead(userId, internalCaseId);
}

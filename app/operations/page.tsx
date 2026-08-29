import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDemoData } from "@/lib/demo";
import { OperationsClient } from "@/components/OperationsClient";
import { getCaseByPublicId } from "@/lib/case-engine";
export const dynamic = "force-dynamic";
export default async function Operations() {
  ensureDemoData();
  const session = await currentSession();
  if (!session || session.role !== "operator") redirect("/");
  const cases = db
    .prepare(
      "SELECT k.*,c.full_name FROM cases k JOIN citizens c ON c.id=k.citizen_id ORDER BY CASE k.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,k.last_activity_at DESC",
    )
    .all() as Record<string, unknown>[];
  const detail = getCaseByPublicId("NCRP-26-847193", true);
  if (!detail) throw new Error("Golden case unavailable");
  return (
    <OperationsClient
      cases={cases}
      initialDetail={detail}
      operatorName={session.displayName}
    />
  );
}

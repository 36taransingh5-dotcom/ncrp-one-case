import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { ensureDemoData } from "@/lib/demo";
import { OperationsClient } from "@/components/OperationsClient";
import { getCaseDetail, listOperationsCases } from "@/lib/repository";
import { isLocalBackend } from "@/lib/supabase/config";
export const dynamic = "force-dynamic";
export default async function Operations() {
  if (isLocalBackend()) ensureDemoData();
  const session = await currentSession();
  if (!session || session.role !== "operator") redirect("/auth");
  const cases = await listOperationsCases();
  if (!cases.length) redirect("/operations/empty");
  const preferred =
    cases.find((item) => item.public_case_id === "NCRP-26-847193") || cases[0];
  const detail = await getCaseDetail(String(preferred.public_case_id), true);
  if (!detail) throw new Error("Case detail unavailable");
  return (
    <OperationsClient
      cases={cases}
      initialDetail={detail}
      operatorName={session.displayName}
      operatorId={session.userId}
      localDemo={isLocalBackend()}
    />
  );
}

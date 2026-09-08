import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { ensureDemoData } from "@/lib/demo";
import { OperationsClient } from "@/components/OperationsClient";
import {
  getCaseDetail,
  listInstitutions,
  listOperationsCases,
} from "@/lib/repository";
import { isDemoAccessEnabled, isLocalBackend } from "@/lib/supabase/config";
import { integrationUsesHttp } from "@/lib/adapters";
export const dynamic = "force-dynamic";
export default async function Operations() {
  const local = isLocalBackend();
  if (local) ensureDemoData();
  const session = await currentSession();
  if (!session || session.role !== "operator") redirect("/auth");
  const cases = await listOperationsCases();
  if (!cases.length) redirect("/operations/empty");
  const preferred =
    cases.find((item) => item.public_case_id === "NCRP-26-847193") || cases[0];
  const [detail, institutions] = await Promise.all([
    getCaseDetail(String(preferred.public_case_id), true),
    local ? Promise.resolve([]) : listInstitutions(),
  ]);
  if (!detail) throw new Error("Case detail unavailable");
  return (
    <OperationsClient
      cases={cases}
      initialDetail={detail}
      operatorName={session.displayName}
      operatorId={session.userId}
      localDemo={isDemoAccessEnabled()}
      supportsTracing={!local}
      institutions={institutions}
      httpIntegrations={integrationUsesHttp()}
    />
  );
}

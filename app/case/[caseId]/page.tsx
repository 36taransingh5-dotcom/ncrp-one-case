import { redirect, notFound } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { ensureDemoData } from "@/lib/demo";
import { getCaseDetail } from "@/lib/repository";
import { isLocalBackend } from "@/lib/supabase/config";
import { CitizenCaseClient } from "@/components/CitizenCaseClient";
export const dynamic = "force-dynamic";
export default async function CasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  if (isLocalBackend()) ensureDemoData();
  const session = await currentSession();
  if (!session) redirect("/auth");
  const caseId = (await params).caseId;
  const detail = await getCaseDetail(caseId);
  if (!detail) notFound();
  if (session.role === "citizen" && detail.citizen.user_id !== session.userId)
    notFound();
  return (
    <CitizenCaseClient
      initial={detail}
      caseId={caseId}
      realtimeMode={isLocalBackend() ? "sse" : "supabase"}
    />
  );
}

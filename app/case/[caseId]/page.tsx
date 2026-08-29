import { redirect, notFound } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { ensureDemoData } from "@/lib/demo";
import { getCaseByPublicId } from "@/lib/case-engine";
import { CitizenCaseClient } from "@/components/CitizenCaseClient";
export const dynamic="force-dynamic";
export default async function CasePage({params}:{params:Promise<{caseId:string}>}){ensureDemoData();const session=await currentSession();if(!session)redirect("/");const caseId=(await params).caseId;const detail=getCaseByPublicId(caseId);if(!detail)notFound();if(session.role==="citizen"&&detail.citizen.user_id!==session.userId)notFound();return <CitizenCaseClient initial={detail} caseId={caseId} />;}

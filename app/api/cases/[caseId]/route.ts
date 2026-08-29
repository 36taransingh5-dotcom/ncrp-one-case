import { NextResponse } from "next/server";
import { getCaseByPublicId } from "@/lib/case-engine";
import { currentSession } from "@/lib/auth";
import { ensureDemoData } from "@/lib/demo";
export async function GET(_:Request,{params}:{params:Promise<{caseId:string}>}) { ensureDemoData(); const session=await currentSession(); if(!session) return NextResponse.json({error:"Please enter a demo role to view this case."},{status:401}); const detail=getCaseByPublicId((await params).caseId,session.role==="operator"); if(!detail)return NextResponse.json({error:"Case not found."},{status:404}); if(session.role==="citizen"&&detail.citizen.user_id!==session.userId)return NextResponse.json({error:"You do not have access to this case."},{status:403}); return NextResponse.json(detail); }

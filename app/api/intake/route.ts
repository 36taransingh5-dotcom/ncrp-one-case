import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createCaseFromIntake } from "@/lib/case-engine";
export async function POST(request:Request){try{const user=await requireRole("citizen");const input=z.object({description:z.string().min(30).max(5000),amount:z.number().int().positive().max(10000000)}).parse(await request.json());return NextResponse.json(createCaseFromIntake({...input,userId:user.userId}));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to create case."},{status:400});}}

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { seedDemo } from "@/lib/seed";
export async function POST(){try{await requireRole("operator");seedDemo(true);return NextResponse.json({ok:true});}catch{return NextResponse.json({error:"Operator access is required."},{status:403});}}

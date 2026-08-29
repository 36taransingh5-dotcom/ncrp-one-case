import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db, initializeDatabase } from "@/lib/db";
import type { Role, Session } from "@/lib/types";
const SECRET = process.env.NCRP_SESSION_SECRET || "local-development-only-change-me";
function sign(value: string) { return crypto.createHmac("sha256", SECRET).update(value).digest("base64url"); }
export function issueSession(userId: string, role: Role) { const value = `${userId}.${role}`; return `${value}.${sign(value)}`; }
export function verifySession(value?: string): {userId:string;role:Role} | null { if (!value) return null; const [userId, role, signature] = value.split("."); const unsigned = `${userId}.${role}`, expected=sign(unsigned); if(!signature || signature.length!==expected.length || (role!=="citizen"&&role!=="operator")) return null; return crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))?{userId,role}:null; }
export async function currentSession(): Promise<Session | null> { initializeDatabase(); const token = (await cookies()).get("ncrp_session")?.value; const data = verifySession(token); if (!data) return null; const user = db.prepare("SELECT id, email, display_name, role FROM users WHERE id = ?").get(data.userId) as {id:string;email:string;display_name:string;role:Role}|undefined; return user && user.role === data.role ? {userId:user.id,email:user.email,displayName:user.display_name,role:user.role} : null; }
export async function requireRole(role: Role) { const session = await currentSession(); if (!session || session.role !== role) throw new Error("UNAUTHORIZED"); return session; }

import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { getCaseDetail } from "@/lib/repository";

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

export async function GET(
  _: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const session = await currentSession();
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const { caseId } = await params;
  const detail = await getCaseDetail(caseId, session.role === "operator");
  if (!detail)
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  if (session.role === "citizen" && detail.citizen.user_id !== session.userId)
    return NextResponse.json(
      { error: "Case unavailable to this account." },
      { status: 403 },
    );
  const c = detail.case,
    fir = detail.fir || {},
    incident = detail.incident;
  const timeline = detail.events
    .filter((event) => Number(event.citizen_visible))
    .map((event) => {
      const payload = event.payload_json as Record<string, unknown>;
      return `- ${String(event.occurred_at)} — ${String(payload.label || event.event_type)}`;
    })
    .join("\n");
  const summary = [
    "NCRP ONE CASE — SYNTHETIC CASE SUMMARY",
    "Independent hackathon prototype. Not an official government service.",
    "All identities, institutions, transactions and agency actions below are synthetic or simulated.",
    "",
    `Case: ${String(c.public_case_id)}`,
    `Citizen: ${String(detail.citizen.full_name)}`,
    `Incident: ${String(incident.structured_summary)}`,
    `Status: ${String(c.current_stage)}`,
    `Current owner: ${String(c.current_owner_name)}`,
    "",
    `Reported: ${money(Number(c.reported_amount))}`,
    `Secured: ${money(Number(c.secured_amount))}`,
    `Tracing: ${money(Number(c.tracing_amount))}`,
    `Unrecovered: ${money(Number(c.unrecovered_amount))}`,
    "",
    `FIR status: ${String(fir.fir_status || "not started").replaceAll("_", " ")}`,
    fir.fir_number
      ? `Synthetic FIR reference: ${String(fir.fir_number)}`
      : "No FIR reference has been recorded.",
    "",
    `SLA: ${String(detail.sla.label)}`,
    "",
    "CITIZEN-VISIBLE EVENT HISTORY",
    timeline,
    "",
    "Evidence integrity fingerprints are recorded by the application but are not a formal forensic chain-of-custody certification.",
  ].join("\n");
  return new Response(summary, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${caseId}-summary.txt"`,
      "Cache-Control": "private, no-store",
    },
  });
}

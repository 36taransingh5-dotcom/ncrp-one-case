import crypto from "node:crypto";
import { db, initializeDatabase } from "@/lib/db";
import { publishCaseUpdate } from "@/lib/realtime";
import type { CaseDetail, CaseStatus, MovementStatus } from "@/lib/types";
import { classifyIncident } from "@/lib/ai/intake";
import { reconcileMovements } from "@/lib/domain/money";
import { assertTransition } from "@/lib/domain/state-machine";
import {
  simulatedBankAdapter,
  simulatedPoliceAdapter,
} from "@/lib/adapters/simulated";

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;
const json = (value: unknown) => JSON.stringify(value);
const parse = (row: Row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) =>
      key.endsWith("_json") && typeof value === "string"
        ? [key, JSON.parse(value)]
        : [key, value],
    ),
  );
export const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

export function getCaseByPublicId(
  publicId: string,
  includeAudits = false,
): CaseDetail | null {
  initializeDatabase();
  const caseRow = db
    .prepare("SELECT * FROM cases WHERE public_case_id=?")
    .get(publicId) as Row | undefined;
  if (!caseRow) return null;
  const caseId = String(caseRow.id);
  const citizen = db
    .prepare(
      "SELECT c.*,u.email,u.display_name FROM citizens c JOIN users u ON c.user_id=u.id WHERE c.id=?",
    )
    .get(String(caseRow.citizen_id)) as Row;
  const incident = db
    .prepare("SELECT * FROM incidents WHERE case_id=?")
    .get(caseId) as Row;
  const list = (sql: string) =>
    db
      .prepare(sql)
      .all(caseId)
      .map((row) => parse(row as Row));
  return {
    case: parse(caseRow),
    citizen: parse(citizen),
    incident: parse(incident),
    events: list(
      "SELECT e.*,i.name institution_name FROM case_events e LEFT JOIN institutions i ON i.id=e.institution_id WHERE e.case_id=? ORDER BY e.occurred_at DESC",
    ),
    movements: list(
      "SELECT fm.*, st.source_identifier_masked source_account, dt.destination_identifier_masked destination_account FROM fund_movements fm LEFT JOIN transactions st ON st.id=fm.source_transaction_id LEFT JOIN transactions dt ON dt.id=fm.destination_transaction_id WHERE fm.case_id=? ORDER BY fm.occurred_at",
    ),
    evidence: list(
      "SELECT * FROM evidence WHERE case_id=? ORDER BY uploaded_at DESC",
    ),
    evidenceRequests: list(
      "SELECT * FROM evidence_requests WHERE case_id=? ORDER BY created_at DESC",
    ),
    assignments: list(
      "SELECT a.*,i.name institution_name FROM agency_assignments a JOIN institutions i ON i.id=a.institution_id WHERE a.case_id=? ORDER BY a.assigned_at",
    ),
    fir: parse(
      (db
        .prepare("SELECT * FROM fir_records WHERE case_id=?")
        .get(caseId) as Row) || {},
    ),
    notifications: list(
      "SELECT * FROM notifications WHERE case_id=? ORDER BY created_at DESC",
    ),
    ...(includeAudits
      ? {
          audits: list(
            "SELECT a.*,u.display_name actor_name FROM audit_logs a JOIN users u ON u.id=a.actor_user_id WHERE a.resource_id=? ORDER BY a.created_at DESC",
          ),
        }
      : {}),
  };
}

function recalculateMoney(caseId: string) {
  const movements = db
    .prepare(
      "SELECT movement_status,amount FROM fund_movements WHERE case_id=?",
    )
    .all(caseId) as { movement_status: MovementStatus; amount: number }[];
  const totals = reconcileMovements(movements);
  const current = db
    .prepare("SELECT case_status FROM cases WHERE id=?")
    .get(caseId) as { case_status: CaseStatus };
  const financialStates: CaseStatus[] = [
    "REPORTED",
    "FINANCIAL_INTERVENTION",
    "FUNDS_TRACING",
    "PARTIALLY_SECURED",
  ];
  const status: CaseStatus = financialStates.includes(current.case_status)
    ? totals.secured > 0
      ? "PARTIALLY_SECURED"
      : "FUNDS_TRACING"
    : current.case_status;
  db.prepare(
    "UPDATE cases SET secured_amount=?,tracing_amount=?,unrecovered_amount=?,case_status=?,current_stage=?,last_activity_at=?,updated_at=? WHERE id=?",
  ).run(
    totals.secured,
    totals.tracing,
    totals.unrecovered,
    status,
    status.replaceAll("_", " "),
    now(),
    now(),
    caseId,
  );
  return { ...totals, case_status: status };
}

function addEvent(input: {
  caseId: string;
  type: string;
  actorType: string;
  actorId?: string;
  institutionId?: string;
  payload: Row;
  previous: Row;
  next: Row;
  visible?: boolean;
  at?: string;
}) {
  db.prepare("INSERT INTO case_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
    id(),
    input.caseId,
    input.type,
    input.actorType,
    input.actorId || null,
    input.institutionId || null,
    json(input.payload),
    json(input.previous),
    json(input.next),
    input.visible === false ? 0 : 1,
    input.at || now(),
    now(),
  );
}
function audit(
  actorId: string,
  action: string,
  resourceId: string,
  metadata: Row,
) {
  db.prepare("INSERT INTO audit_logs VALUES(?,?,?,?,?,?,?)").run(
    id(),
    actorId,
    action,
    "case",
    resourceId,
    json(metadata),
    now(),
  );
}
function notifyCitizen(
  caseId: string,
  type: string,
  title: string,
  body: string,
) {
  const user = db
    .prepare(
      "SELECT u.id FROM users u JOIN citizens c ON c.user_id=u.id JOIN cases k ON k.citizen_id=c.id WHERE k.id=?",
    )
    .get(caseId) as { id: string };
  db.prepare("INSERT INTO notifications VALUES(?,?,?,?,?,?,?,?)").run(
    id(),
    user.id,
    caseId,
    type,
    title,
    body,
    null,
    now(),
  );
}
function updateStage(
  caseId: string,
  from: CaseStatus,
  to: CaseStatus,
  ownerType: string,
  ownerName: string,
) {
  assertTransition(from, to);
  db.prepare(
    "UPDATE cases SET case_status=?,current_stage=?,current_owner_type=?,current_owner_name=?,last_activity_at=?,updated_at=? WHERE id=?",
  ).run(
    to,
    to.replaceAll("_", " "),
    ownerType,
    ownerName,
    now(),
    now(),
    caseId,
  );
}

export function createCaseFromIntake(input: {
  userId: string;
  description: string;
  amount: number;
}) {
  initializeDatabase();
  const citizen = db
    .prepare("SELECT * FROM citizens WHERE user_id=?")
    .get(input.userId) as Row | undefined;
  if (!citizen) throw new Error("Citizen profile unavailable.");
  const caseId = id(),
    publicId = `NCRP-26-${crypto.randomInt(100000, 999999)}`,
    at = now(),
    structured = classifyIncident(input.description);
  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO cases VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      caseId,
      publicId,
      String(citizen.id),
      "Financial cyber fraud",
      "REPORTED",
      "high",
      input.amount,
      0,
      input.amount,
      0,
      "government",
      "NCRP One Case intake",
      "REPORTED",
      at,
      at,
      null,
      at,
      at,
    );
    db.prepare("INSERT INTO incidents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      id(),
      caseId,
      input.description,
      structured.summary,
      structured.fraudType,
      structured.mechanism,
      structured.impersonatedEntity,
      structured.paymentChannel,
      at,
      at,
      String(citizen.city),
      structured.confidence,
      at,
      at,
    );
    db.prepare("INSERT INTO fund_movements VALUES(?,?,?,?,?,?,?,?)").run(
      id(),
      caseId,
      null,
      null,
      input.amount,
      "tracing",
      at,
      at,
    );
    addEvent({
      caseId,
      type: "CASE_CREATED",
      actorType: "citizen",
      actorId: input.userId,
      payload: {
        label: "Complaint received",
        amount: input.amount,
        classification: "deterministic_fallback",
      },
      previous: {},
      next: { case_status: "REPORTED" },
    });
    addEvent({
      caseId,
      type: "INCIDENT_CLASSIFIED",
      actorType: "system",
      payload: {
        label: "Report structured for financial intervention",
        summary: structured.summary,
      },
      previous: { case_status: "REPORTED" },
      next: { case_status: "REPORTED" },
    });
    notifyCitizen(
      caseId,
      "case_created",
      `Case ${publicId} created`,
      "Your synthetic demo case has been created and is ready for financial intervention.",
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  publishCaseUpdate(caseId);
  return { publicId, structured };
}

export async function secureAdditionalFunds(
  publicCaseId: string,
  actorId: string,
  amount: number,
) {
  const detail = getCaseByPublicId(publicCaseId);
  if (!detail) throw new Error("CASE_NOT_FOUND");
  const caseRow = detail.case,
    caseId = String(caseRow.id);
  if (amount !== 6700)
    throw new Error(
      "Only the validated ₹6,700 secondary-account hold is available in this demo.",
    );
  const candidate = db
    .prepare(
      "SELECT * FROM fund_movements WHERE case_id=? AND movement_status='tracing' AND amount=? LIMIT 1",
    )
    .get(caseId, amount) as Row | undefined;
  if (!candidate)
    throw new Error("No matching traceable fund movement remains.");
  const adapterResult = await simulatedBankAdapter.requestFreeze(
    caseId,
    "ICICI ••1834",
    amount,
  );
  if (!adapterResult.accepted)
    throw new Error("The simulated bank adapter declined the freeze request.");
  const before = {
    secured_amount: caseRow.secured_amount,
    tracing_amount: caseRow.tracing_amount,
    unrecovered_amount: caseRow.unrecovered_amount,
    case_status: caseRow.case_status,
  };
  db.exec("BEGIN");
  try {
    db.prepare(
      "UPDATE fund_movements SET movement_status='secured',occurred_at=? WHERE id=?",
    ).run(now(), String(candidate.id));
    const next = recalculateMoney(caseId);
    db.prepare(
      "UPDATE cases SET current_owner_type=?,current_owner_name=? WHERE id=?",
    ).run("government", "Bengaluru Cyber Crime Unit", caseId);
    addEvent({
      caseId,
      type: "FUNDS_SECURED",
      actorType: "operator",
      actorId,
      institutionId: "inst-icici",
      payload: {
        label: `${money(amount)} secured in secondary beneficiary account`,
        amount,
        account: "ICICI ••1834",
        simulated: true,
        providerReference: adapterResult.providerReference,
      },
      previous: before,
      next,
    });
    audit(actorId, "FUNDS_SECURED", caseId, {
      amount,
      movementId: String(candidate.id),
      providerReference: adapterResult.providerReference,
    });
    notifyCitizen(
      caseId,
      "funds_secured",
      `${money(amount)} additional funds secured`,
      "A simulated beneficiary-bank hold secured additional traceable funds in account ••1834.",
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  publishCaseUpdate(caseId);
  return getCaseByPublicId(publicCaseId, true);
}

export type OperatorAction =
  | { type: "START_INVESTIGATION" }
  | { type: "REQUEST_EVIDENCE"; title: string; description: string }
  | { type: "ACCEPT_EVIDENCE" }
  | { type: "START_FIR_REVIEW" }
  | { type: "REGISTER_FIR" }
  | { type: "ESCALATE_CASE" }
  | { type: "RESOLVE_CASE" }
  | { type: "CLOSE_CASE" };

export async function executeOperatorAction(
  publicCaseId: string,
  actorId: string,
  action: OperatorAction,
) {
  const detail = getCaseByPublicId(publicCaseId, true);
  if (!detail) throw new Error("CASE_NOT_FOUND");
  const caseRow = detail.case,
    caseId = String(caseRow.id),
    current = String(caseRow.case_status) as CaseStatus;
  let adapter: Row = {};
  if (action.type === "START_INVESTIGATION")
    adapter = await simulatedPoliceAdapter.assignCyberCell(caseId);
  if (action.type === "START_FIR_REVIEW")
    adapter = await simulatedPoliceAdapter.startFirReview(caseId);
  if (action.type === "REGISTER_FIR")
    adapter = await simulatedPoliceAdapter.registerFir(caseId);
  db.exec("BEGIN");
  try {
    switch (action.type) {
      case "START_INVESTIGATION": {
        updateStage(
          caseId,
          current,
          "INVESTIGATION",
          "government",
          "Bengaluru Cyber Crime Unit",
        );
        const existing = db
          .prepare(
            "SELECT id FROM agency_assignments WHERE case_id=? AND institution_id='inst-cyber'",
          )
          .get(caseId) as Row | undefined;
        if (!existing)
          db.prepare(
            "INSERT INTO agency_assignments VALUES(?,?,?,?,?,?,?,?,?)",
          ).run(
            id(),
            caseId,
            "inst-cyber",
            "investigation",
            "acknowledged",
            now(),
            now(),
            null,
            now(),
          );
        addEvent({
          caseId,
          type: "INVESTIGATION_STARTED",
          actorType: "operator",
          actorId,
          institutionId: "inst-cyber",
          payload: {
            label: "Investigation started",
            simulated: true,
            ...adapter,
          },
          previous: { case_status: current },
          next: { case_status: "INVESTIGATION" },
        });
        notifyCitizen(
          caseId,
          "investigation_started",
          "Investigation started",
          "The simulated Cyber Crime Unit now owns the next action.",
        );
        break;
      }
      case "REQUEST_EVIDENCE": {
        const open = db
          .prepare(
            "SELECT id FROM evidence_requests WHERE case_id=? AND status='open'",
          )
          .get(caseId);
        if (open) throw new Error("An evidence request is already open.");
        const dueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        db.prepare(
          "INSERT INTO evidence_requests VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          id(),
          caseId,
          "Bengaluru Cyber Crime Unit",
          action.title,
          action.description,
          "financial",
          dueAt,
          "open",
          null,
          now(),
          null,
        );
        addEvent({
          caseId,
          type: "EVIDENCE_REQUESTED",
          actorType: "operator",
          actorId,
          institutionId: "inst-cyber",
          payload: {
            label: action.title,
            description: action.description,
            dueAt,
          },
          previous: {},
          next: { evidence_request_status: "open" },
        });
        notifyCitizen(
          caseId,
          "evidence_requested",
          "Evidence requested",
          action.description,
        );
        break;
      }
      case "ACCEPT_EVIDENCE": {
        const request = db
          .prepare(
            "SELECT * FROM evidence_requests WHERE case_id=? AND status='submitted' ORDER BY created_at LIMIT 1",
          )
          .get(caseId) as Row | undefined;
        if (!request)
          throw new Error("No submitted evidence is waiting for acceptance.");
        db.prepare(
          "UPDATE evidence_requests SET status='accepted',resolved_at=? WHERE id=?",
        ).run(now(), String(request.id));
        addEvent({
          caseId,
          type: "EVIDENCE_ACCEPTED",
          actorType: "operator",
          actorId,
          institutionId: "inst-cyber",
          payload: {
            label: "Submitted evidence accepted",
            requestId: String(request.id),
          },
          previous: { status: "submitted" },
          next: { status: "accepted" },
        });
        notifyCitizen(
          caseId,
          "evidence_accepted",
          "Evidence accepted",
          "The assigned team accepted your submitted evidence.",
        );
        break;
      }
      case "START_FIR_REVIEW": {
        const fir = detail.fir as Row;
        if (fir.fir_status === "under_review")
          throw new Error("FIR review is already in progress.");
        updateStage(
          caseId,
          current,
          "FIR_REVIEW",
          "police",
          "Bengaluru Cyber Crime Police Station",
        );
        if (fir.id)
          db.prepare(
            "UPDATE fir_records SET fir_status='under_review',reason=?,updated_at=? WHERE case_id=?",
          ).run(
            "Review is in progress; no FIR outcome has been determined.",
            now(),
            caseId,
          );
        else
          db.prepare("INSERT INTO fir_records VALUES(?,?,?,?,?,?,?,?,?)").run(
            id(),
            caseId,
            "under_review",
            null,
            "Bengaluru Cyber Crime Police Station (simulated)",
            null,
            "Review is in progress; no FIR outcome has been determined.",
            now(),
            now(),
          );
        addEvent({
          caseId,
          type: "FIR_REVIEW_STARTED",
          actorType: "operator",
          actorId,
          institutionId: "inst-police",
          payload: { label: "FIR review started", simulated: true, ...adapter },
          previous: { fir_status: fir.fir_status || "not_started" },
          next: { fir_status: "under_review" },
        });
        notifyCitizen(
          caseId,
          "fir_review",
          "FIR review started",
          "The simulated police station has started reviewing the case for FIR registration.",
        );
        break;
      }
      case "REGISTER_FIR": {
        const fir = detail.fir as Row;
        if (fir.fir_status !== "under_review")
          throw new Error("FIR registration requires an active FIR review.");
        db.prepare(
          "UPDATE fir_records SET fir_status='registered',fir_number=?,registered_at=?,reason=?,updated_at=? WHERE case_id=?",
        ).run(
          String(adapter.firNumber),
          now(),
          "Registered in the simulated police workflow.",
          now(),
          caseId,
        );
        db.prepare(
          "UPDATE cases SET case_status='FIR_REGISTERED',current_stage='FIR REGISTERED',current_owner_type='police',current_owner_name='Bengaluru Cyber Crime Police Station',last_activity_at=?,updated_at=? WHERE id=?",
        ).run(now(), now(), caseId);
        addEvent({
          caseId,
          type: "FIR_REGISTERED",
          actorType: "operator",
          actorId,
          institutionId: "inst-police",
          payload: {
            label: `FIR ${String(adapter.firNumber)} registered`,
            simulated: true,
          },
          previous: { fir_status: "under_review", case_status: current },
          next: { fir_status: "registered", case_status: "FIR_REGISTERED" },
        });
        notifyCitizen(
          caseId,
          "fir_registered",
          "FIR registered in simulation",
          `Reference ${String(adapter.firNumber)} was created in the simulated police adapter.`,
        );
        break;
      }
      case "ESCALATE_CASE": {
        const prior = db
          .prepare(
            "SELECT id FROM case_events WHERE case_id=? AND event_type='CASE_ESCALATED'",
          )
          .get(caseId);
        if (prior)
          throw new Error("This case already has an active escalation.");
        addEvent({
          caseId,
          type: "CASE_ESCALATED",
          actorType: "operator",
          actorId,
          institutionId: "inst-cyber",
          payload: {
            label: "Case escalated for overdue response",
            reason: "Operator escalation",
            simulated: true,
          },
          previous: { owner: caseRow.current_owner_name },
          next: { owner: "Bengaluru Cyber Crime Unit — escalation desk" },
        });
        db.prepare(
          "UPDATE cases SET current_owner_name=?,last_activity_at=?,updated_at=? WHERE id=?",
        ).run(
          "Bengaluru Cyber Crime Unit — escalation desk",
          now(),
          now(),
          caseId,
        );
        notifyCitizen(
          caseId,
          "case_escalated",
          "Case escalated",
          "An escalation was recorded for the delayed institutional response.",
        );
        break;
      }
      case "RESOLVE_CASE": {
        if (Number(caseRow.tracing_amount) > 0)
          throw new Error(
            "The case cannot be resolved while funds are still being traced.",
          );
        updateStage(
          caseId,
          current,
          "RESOLUTION",
          "government",
          "Bengaluru Cyber Crime Unit",
        );
        addEvent({
          caseId,
          type: "CASE_RESOLVED",
          actorType: "operator",
          actorId,
          payload: { label: "Case moved to resolution" },
          previous: { case_status: current },
          next: { case_status: "RESOLUTION" },
        });
        notifyCitizen(
          caseId,
          "case_resolved",
          "Case moved to resolution",
          "The active investigation work is complete in this simulation.",
        );
        break;
      }
      case "CLOSE_CASE": {
        updateStage(
          caseId,
          current,
          "CLOSED",
          "government",
          "NCRP One Case archive",
        );
        db.prepare("UPDATE cases SET closed_at=? WHERE id=?").run(
          now(),
          caseId,
        );
        addEvent({
          caseId,
          type: "CASE_CLOSED",
          actorType: "operator",
          actorId,
          payload: { label: "Case closed" },
          previous: { case_status: current },
          next: { case_status: "CLOSED" },
        });
        notifyCitizen(
          caseId,
          "case_closed",
          "Case closed",
          "The synthetic case has been closed.",
        );
        break;
      }
    }
    audit(actorId, action.type, caseId, { action, adapter, simulated: true });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  publishCaseUpdate(caseId);
  return getCaseByPublicId(publicCaseId, true);
}

export function markNotificationsRead(userId: string, publicCaseId: string) {
  const detail = getCaseByPublicId(publicCaseId);
  if (!detail || detail.citizen.user_id !== userId)
    throw new Error("CASE_NOT_FOUND");
  db.prepare(
    "UPDATE notifications SET read_at=? WHERE case_id=? AND user_id=? AND read_at IS NULL",
  ).run(now(), String(detail.case.id), userId);
  publishCaseUpdate(String(detail.case.id));
}

export function createEvidence(input: {
  caseId: string;
  userId: string;
  type: string;
  title: string;
  path: string;
  mime: string;
  size: number;
  sha256: string;
}) {
  const evidenceId = id();
  db.prepare("INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
    evidenceId,
    input.caseId,
    input.userId,
    input.type,
    input.title,
    input.path,
    input.mime,
    input.size,
    input.sha256,
    "{}",
    now(),
    now(),
  );
  const request = db
    .prepare(
      "SELECT * FROM evidence_requests WHERE case_id=? AND status='open' LIMIT 1",
    )
    .get(input.caseId) as Row | undefined;
  if (request)
    db.prepare(
      "UPDATE evidence_requests SET status='submitted',submitted_evidence_id=?,resolved_at=? WHERE id=?",
    ).run(evidenceId, now(), String(request.id));
  addEvent({
    caseId: input.caseId,
    type: "EVIDENCE_UPLOADED",
    actorType: "citizen",
    actorId: input.userId,
    payload: {
      label: `${input.title} uploaded`,
      title: input.title,
      evidenceType: input.type,
      sha256: input.sha256,
    },
    previous: { evidence_request_status: request?.status || null },
    next: { evidence_request_status: request ? "submitted" : null },
  });
  db.prepare("UPDATE cases SET last_activity_at=?,updated_at=? WHERE id=?").run(
    now(),
    now(),
    input.caseId,
  );
  publishCaseUpdate(input.caseId);
}

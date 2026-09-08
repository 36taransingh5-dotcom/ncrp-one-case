"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CaseDetail, CaseListRow } from "@/lib/types";
import type { Intelligence } from "@/lib/ai/schema";
import { buildOperatorCaseSummary } from "@/lib/domain/operator-summary";
import { AiAnalysis } from "./AiAnalysis";
import { PrototypeNotice } from "./PrototypeNotice";

type Row = Record<string, unknown>;
type SimpleAction =
  | "IDENTIFY_BENEFICIARY_BANK"
  | "SEND_FREEZE_REQUEST"
  | "MARK_FUNDS_MOVED"
  | "MARK_FUNDS_WITHDRAWN"
  | "ASSIGN_CYBER_CELL"
  | "START_INVESTIGATION"
  | "ACCEPT_EVIDENCE"
  | "START_FIR_REVIEW"
  | "REGISTER_FIR"
  | "ESCALATE_CASE"
  | "RESOLVE_CASE"
  | "CLOSE_CASE";
const actionLabels: Record<SimpleAction | "REQUEST_EVIDENCE", string> = {
  IDENTIFY_BENEFICIARY_BANK: "Beneficiary bank identified",
  SEND_FREEZE_REQUEST: "Freeze request sent",
  MARK_FUNDS_MOVED: "Funds traced to another account",
  MARK_FUNDS_WITHDRAWN: "Funds withdrawn",
  ASSIGN_CYBER_CELL: "Cyber Crime Unit assigned",
  START_INVESTIGATION: "Investigation started",
  REQUEST_EVIDENCE: "Document requested",
  ACCEPT_EVIDENCE: "Document accepted",
  START_FIR_REVIEW: "Police review started",
  REGISTER_FIR: "FIR registered",
  ESCALATE_CASE: "Case escalated",
  RESOLVE_CASE: "Case moved to resolution",
  CLOSE_CASE: "Case closed",
};

const rupee = (value: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
// Pinned to IST so server-rendered and client-rendered times agree.
const when = (value: unknown) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date(String(value)));

const movementStatusLabel: Record<string, string> = {
  tracing: "Being traced",
  moved: "Traced to another account",
  secured: "Secured",
  unrecovered: "Unrecovered",
  withdrawn: "Unrecovered",
};

const firStatusLabel: Record<string, string> = {
  not_started: "Not started",
  under_review: "Under review",
  registered: "Registered",
  declined: "Not registered",
};

function jobTitle(job: Row) {
  const action = String(job.action || "").replaceAll("_", " ");
  if (/freeze/.test(action)) return "Ask the bank to freeze funds";
  if (/identify/.test(action)) return "Identify the beneficiary bank";
  if (/notify/.test(action)) return "Notify the bank";
  if (/assign|cyber/.test(action)) return "Assign the cyber cell";
  if (/\bfir\b/.test(action)) return "Police review";
  if (/complaint/.test(action)) return "File the official complaint";
  return action;
}

function jobStatusLabel(status: unknown) {
  switch (String(status || "")) {
    case "pending":
    case "queued":
      return "Waiting for response";
    case "processing":
      return "In progress";
    case "retrying":
      return "Retry queued";
    case "succeeded":
    case "completed":
      return "Completed";
    case "failed":
      return "Could not complete";
    default:
      return String(status || "Unknown").replaceAll("_", " ");
  }
}

type Institution = { id: string; name: string; short_code: string | null };

export function OperationsClient({
  cases,
  initialDetail,
  operatorName,
  operatorId,
  localDemo,
  supportsTracing,
  institutions,
  httpIntegrations,
}: {
  cases: CaseListRow[];
  initialDetail: CaseDetail;
  operatorName: string;
  operatorId: string;
  localDemo: boolean;
  supportsTracing: boolean;
  institutions: Institution[];
  httpIntegrations: boolean;
}) {
  const [rows, setRows] = useState(cases);
  const [detail, setDetail] = useState(initialDetail);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [stage, setStage] = useState("all");
  const [scope, setScope] = useState("all");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">(
    "success",
  );
  const [busy, setBusy] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [aiBrief, setAiBrief] = useState<Intelligence | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const commandKeys = useRef(new Map<string, string>());
  const selected = detail.case as Row;
  const fir = detail.fir as Row;
  const selectedCaseId = String(selected.public_case_id);
  const isGolden = selectedCaseId === "NCRP-26-847193";
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const command = buildOperatorCaseSummary(detail, {
    nowMs,
    recommendedAction: aiBrief?.recommendedAction ?? null,
  });
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        const haystack =
          `${row.public_case_id} ${row.full_name} ${row.case_type} ${row.current_owner_name}`.toLowerCase();
        return (
          haystack.includes(query.toLowerCase()) &&
          (priority === "all" || row.priority === priority) &&
          (stage === "all" || row.case_status === stage) &&
          (scope === "all" || row.assigned_operator_id === operatorId)
        );
      }),
    [rows, query, priority, stage, scope, operatorId],
  );
  const stages = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => String(row.case_status)))).sort(),
    [rows],
  );
  const fail = (text: string) => {
    setMessageTone("error");
    setMessage(text);
  };
  const updateDetail = (next: CaseDetail, success: string) => {
    setDetail(next);
    const nextCase = next.case as Row;
    setRows((current) =>
      current.map((row) =>
        row.public_case_id === nextCase.public_case_id
          ? { ...row, ...nextCase }
          : row,
      ),
    );
    setMessageTone("success");
    setMessage(success);
  };
  const selectCase = async (caseId: string) => {
    if (caseId === selectedCaseId) return;
    setBusy("select");
    setMessage("");
    const response = await fetch(`/api/operations/cases/${caseId}`, {
      cache: "no-store",
    });
    const data = await response.json();
    setBusy("");
    if (response.status === 401) setSessionExpired(true);
    if (!response.ok)
      return fail(data.error || "Case detail could not be loaded.");
    setAiBrief(null);
    setDetail(data);
  };
  const secure = async (amount = 6700) => {
    const keyName = `${selectedCaseId}:SECURE_ADDITIONAL_FUNDS:${amount}`;
    const idempotencyKey =
      commandKeys.current.get(keyName) || crypto.randomUUID();
    commandKeys.current.set(keyName, idempotencyKey);
    setBusy("secure");
    setMessage("");
    const response = await fetch("/api/operations/secure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: selectedCaseId,
        amount,
        expectedVersion: Number(selected.version || 0),
        idempotencyKey,
      }),
    });
    const data = await response.json();
    setBusy("");
    if (response.status === 401) setSessionExpired(true);
    if (!response.ok)
      return fail(data.error || "Action could not be completed.");
    commandKeys.current.delete(keyName);
    updateDetail(
      data,
      `Recorded ${rupee(amount)} as secured. The citizen can see this now.`,
    );
  };
  const traceableMovements = detail.movements.filter((movement) =>
    ["tracing", "moved"].includes(String(movement.movement_status)),
  );
  const [traceMovementId, setTraceMovementId] = useState("");
  const [traceAmount, setTraceAmount] = useState("");
  const [traceStatus, setTraceStatus] = useState<
    "secured" | "tracing" | "unrecovered"
  >("secured");
  const [traceInstitution, setTraceInstitution] = useState("");
  const activeTraceMovement = traceableMovements.find(
    (movement) => String(movement.id) === traceMovementId,
  );
  const trace = async () => {
    if (!activeTraceMovement) return fail("Choose a traced amount first.");
    const amount = Number(traceAmount);
    if (!Number.isInteger(amount) || amount <= 0)
      return fail("Enter a split amount greater than zero.");
    if (amount > Number(activeTraceMovement.amount))
      return fail(
        `That movement only has ${rupee(activeTraceMovement.amount)} left to split.`,
      );
    const keyName = `${selectedCaseId}:TRACE_MOVEMENT:${traceMovementId}:${amount}:${traceStatus}:${traceInstitution}`;
    const idempotencyKey =
      commandKeys.current.get(keyName) || crypto.randomUUID();
    commandKeys.current.set(keyName, idempotencyKey);
    setBusy("trace");
    setMessage("");
    const response = await fetch("/api/operations/trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: selectedCaseId,
        movementId: traceMovementId,
        amount,
        status: traceStatus,
        institutionId: traceInstitution || undefined,
        expectedVersion: Number(selected.version || 0),
        idempotencyKey,
      }),
    });
    const data = await response.json();
    setBusy("");
    if (response.status === 401) setSessionExpired(true);
    if (!response.ok)
      return fail(data.error || "Action could not be completed.");
    commandKeys.current.delete(keyName);
    setTraceMovementId("");
    setTraceAmount("");
    setTraceInstitution("");
    const destination = institutions.find((i) => i.id === traceInstitution);
    updateDetail(
      data,
      `${rupee(amount)} ${traceStatus === "secured" ? "secured" : traceStatus === "unrecovered" ? "marked unrecovered" : "traced to another account"}${destination ? ` at ${destination.name}` : ""}. The citizen can see this now.`,
    );
  };
  const act = async (action: SimpleAction | "REQUEST_EVIDENCE") => {
    const keyName = `${selectedCaseId}:${action}`;
    const idempotencyKey =
      commandKeys.current.get(keyName) || crypto.randomUUID();
    commandKeys.current.set(keyName, idempotencyKey);
    setBusy(action);
    setMessage("");
    const actionPayload =
      action === "REQUEST_EVIDENCE"
        ? {
            type: action,
            title: "Updated bank statement needed",
            description:
              "Upload a bank statement covering the latest 48-hour period.",
          }
        : { type: action };
    const response = await fetch("/api/operations/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: selectedCaseId,
        action: actionPayload,
        expectedVersion: Number(selected.version || 0),
        idempotencyKey,
      }),
    });
    const data = await response.json();
    setBusy("");
    if (response.status === 401) setSessionExpired(true);
    if (!response.ok)
      return fail(data.error || "Action could not be completed.");
    commandKeys.current.delete(keyName);
    updateDetail(
      data,
      `${actionLabels[action]} recorded. The citizen can see this now.`,
    );
  };
  const reset = async () => {
    setBusy("reset");
    const response = await fetch("/api/demo/reset", { method: "POST" });
    if (response.ok) location.reload();
    else {
      setBusy("");
      fail("Reset failed. Please retry.");
    }
  };
  const securableMovement = detail.movements.find(
    (movement) =>
      movement.movement_status === "tracing" &&
      Number(movement.amount) === 6700,
  );
  const hasOpen = detail.evidenceRequests.some(
    (request) => request.status === "open",
  );
  const hasSubmitted = detail.evidenceRequests.some(
    (request) => request.status === "submitted",
  );
  const hasEvent = (eventType: string) =>
    detail.events.some((event) => event.event_type === eventType);
  const hasTraceableMovement = detail.movements.some((movement) =>
    ["tracing", "moved"].includes(String(movement.movement_status)),
  );
  const actionButtons: [string, SimpleAction | "REQUEST_EVIDENCE", boolean][] =
    [
      [
        "Identify beneficiary bank",
        "IDENTIFY_BENEFICIARY_BANK",
        hasEvent("BENEFICIARY_BANK_IDENTIFIED") ||
          String(selected.case_status) !== "REPORTED",
      ],
      [
        "Send freeze request",
        "SEND_FREEZE_REQUEST",
        !hasEvent("BENEFICIARY_BANK_IDENTIFIED") ||
          hasEvent("FREEZE_REQUEST_CREATED") ||
          !hasTraceableMovement,
      ],
      [
        "Funds traced to another account",
        "MARK_FUNDS_MOVED",
        !detail.movements.some(
          (movement) => movement.movement_status === "tracing",
        ),
      ],
      ["Mark funds withdrawn", "MARK_FUNDS_WITHDRAWN", !hasTraceableMovement],
      [
        "Assign Cyber Crime Unit",
        "ASSIGN_CYBER_CELL",
        hasEvent("CYBER_CELL_ASSIGNED"),
      ],
      [
        "Start investigation",
        "START_INVESTIGATION",
        String(selected.case_status) !== "PARTIALLY_SECURED",
      ],
      ["Request evidence", "REQUEST_EVIDENCE", hasOpen],
      ["Accept submitted evidence", "ACCEPT_EVIDENCE", !hasSubmitted],
      [
        "Start FIR review",
        "START_FIR_REVIEW",
        fir.fir_status === "under_review" || fir.fir_status === "registered",
      ],
      ["Register FIR", "REGISTER_FIR", fir.fir_status !== "under_review"],
      [
        "Escalate case",
        "ESCALATE_CASE",
        detail.events.some((event) => event.event_type === "CASE_ESCALATED"),
      ],
      [
        "Move to resolution",
        "RESOLVE_CASE",
        Number(selected.tracing_amount) > 0,
      ],
      ["Close case", "CLOSE_CASE", selected.case_status !== "RESOLUTION"],
    ];
  return (
    <>
      <PrototypeNotice extra="Bank, police and reporting calls are sandbox or simulated unless marked live." />
      <header className="dash-head">
        <div className="shell case-title">
          <div>
            <div className="crumb">
              Operations console · signed in as {operatorName}
            </div>
            <h1>Cases</h1>
            <div>Follow the money, the next action, and who owns it.</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a className="btn secondary" href="/integrations">
              Integration status
            </a>
            <a
              className="btn secondary"
              href={`/case/${selectedCaseId}`}
              target="_blank"
            >
              Open citizen view
            </a>
            {localDemo ? (
              <button
                className="btn secondary"
                onClick={reset}
                disabled={Boolean(busy)}
              >
                Reset demo
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="shell main-grid">
        <section>
          <div className="card section">
            <div className="case-title">
              <div>
                <div className="label">Open cases</div>
                <h2 style={{ margin: "4px 0 0" }}>Waiting for action</h2>
              </div>
              <span className="badge">
                {visibleRows.length} of {rows.length} cases
              </span>
            </div>
            <div className="queue-filters">
              <label>
                Queue
                <select
                  value={scope}
                  onChange={(event) => setScope(event.target.value)}
                >
                  <option value="all">All authorized cases</option>
                  <option value="mine">My queue</option>
                </select>
              </label>
              <label>
                Search
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Case ID, citizen, owner"
                />
              </label>
              <label>
                Priority
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  <option value="all">All priorities</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                </select>
              </label>
              <label>
                Stage
                <select
                  value={stage}
                  onChange={(event) => setStage(event.target.value)}
                >
                  <option value="all">All stages</option>
                  {stages.map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="tablewrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Citizen</th>
                    <th>Amount</th>
                    <th>Priority</th>
                    <th>Stage</th>
                    <th>Current owner</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr
                      className={
                        row.public_case_id === selectedCaseId
                          ? "selected-row"
                          : ""
                      }
                      key={String(row.id)}
                      onClick={() => selectCase(String(row.public_case_id))}
                    >
                      <td>
                        <button
                          className="rowlink row-button"
                          disabled={busy === "select"}
                        >
                          {String(row.public_case_id)}
                        </button>
                        {row.public_case_id === "NCRP-26-847193" && (
                          <span className="demo-tag">Sample case</span>
                        )}
                      </td>
                      <td>{String(row.full_name)}</td>
                      <td>{rupee(row.reported_amount)}</td>
                      <td>
                        <span className="badge">{String(row.priority)}</span>
                      </td>
                      <td>{String(row.current_stage)}</td>
                      <td>{String(row.current_owner_name)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleRows.length && (
                <div className="empty">No cases match these filters.</div>
              )}
            </div>
          </div>
          <div className="card section">
            <div className="label">Selected case</div>
            <h2>
              {selectedCaseId} · {String(selected.current_stage).toLowerCase()}
            </h2>
          </div>
          <details className="card section secondary-detail">
            <summary>Operator audit</summary>
            {detail.audits?.length ? (
              <div className="timeline">
                {detail.audits.map((entry) => (
                  <div className="event" key={String(entry.id)}>
                    <time>{when(entry.created_at)}</time>
                    <strong>{String(entry.action).replaceAll("_", " ")}</strong>
                    <p>{String(entry.actor_name)} · operator action recorded</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                No operator actions have been recorded since the last reset.
              </div>
            )}
          </details>
        </section>
        <aside className="aside">
          <section
            className="card section operator-command"
            aria-labelledby="operator-command-heading"
          >
            <div className="label">Command centre</div>
            <h2 id="operator-command-heading">Command centre</h2>
            <p className="operator-command-case">Case {command.caseId}</p>
            <p className="operator-command-reported">
              {command.reported} reported
            </p>
            <dl className="operator-command-money">
              <div>
                <dt>Secured</dt>
                <dd className="stat-green">{command.secured}</dd>
              </div>
              <div>
                <dt>Tracing</dt>
                <dd className="stat-amber">{command.tracing}</dd>
              </div>
              <div>
                <dt>Unrecovered</dt>
                <dd className="stat-red">{command.unrecovered}</dd>
              </div>
            </dl>
            <dl className="operator-command-facts">
              <div>
                <dt>Next action</dt>
                <dd>{command.nextAction}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{command.owner}</dd>
              </div>
              <div>
                <dt>Blocker</dt>
                <dd>{command.blocker}</dd>
              </div>
              <div>
                <dt>SLA</dt>
                <dd>{command.sla}</dd>
              </div>
              <div>
                <dt>AI recommendation</dt>
                <dd>{command.aiRecommendation}</dd>
              </div>
            </dl>
          </section>
          <details className="card section">
            <summary>Citizen-submitted report and additional details</summary>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {String(detail.incident.raw_description || "No report supplied.")}
            </p>
          </details>
          <AiAnalysis
            key={`${selectedCaseId}:${selected.version}`}
            caseId={selectedCaseId}
            onResult={setAiBrief}
          />
          {message && (
            <div className={messageTone} role="status">
              {message}
            </div>
          )}
          {sessionExpired && (
            <div className="error" role="alert">
              Your operator session has ended.{" "}
              <a className="rowlink" href="/">
                Return to demo entry
              </a>{" "}
              to continue.
            </div>
          )}
          {isGolden && (
            <div className="card demo-action">
              <div className="label">Demo action</div>
              <h2>Secure ₹6,700</h2>
              <p>
                Hold the ₹6,700 traced to ICICI ••1834. The citizen sees this
                immediately.
              </p>
              {securableMovement && (
                <div className="demo-action-preview">
                  <div>
                    <span>Secured now</span>
                    <strong>{rupee(selected.secured_amount)}</strong>
                  </div>
                  <span className="demo-action-arrow" aria-hidden>
                    →
                  </span>
                  <div>
                    <span>After this action</span>
                    <strong className="stat-green">
                      {rupee(Number(selected.secured_amount) + 6700)}
                    </strong>
                  </div>
                </div>
              )}
              <button
                className="btn"
                style={{ width: "100%" }}
                onClick={() => secure(6700)}
                disabled={Boolean(busy) || !securableMovement}
              >
                {busy === "secure"
                  ? "Securing…"
                  : securableMovement
                    ? "Secure ₹6,700"
                    : "✓ Already secured"}
              </button>
              <p className="demo-action-note">
                Running it twice is rejected — the case will not double-count.
              </p>
            </div>
          )}
          {!isGolden &&
          Number(selected.tracing_amount) > 0 &&
          (!localDemo || Number(selected.tracing_amount) === 6700) ? (
            <div className="card">
              <div className="label">Financial intervention</div>
              <h2 style={{ margin: "6px 0" }}>
                Secure {rupee(selected.tracing_amount)}
              </h2>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                Confirm that this amount is now held. The bank response is
                recorded on the case; technical job status is below.
              </p>
              <button
                className="btn"
                style={{ width: "100%" }}
                onClick={() => secure(Number(selected.tracing_amount))}
                disabled={Boolean(busy)}
              >
                {busy === "secure" ? "Recording…" : "Record funds secured"}
              </button>
            </div>
          ) : null}
          {supportsTracing && traceableMovements.length > 0 && (
            <div className="card">
              <div className="label">Trace funds</div>
              <h2 style={{ margin: "6px 0" }}>
                Trace funds to another account
              </h2>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                Move part of a traced amount to another account, or confirm part
                of it as secured or unrecovered. The rest stays where it was.
              </p>
              <div className="form">
                <label>
                  Traced amount
                  <select
                    value={traceMovementId}
                    onChange={(event) => setTraceMovementId(event.target.value)}
                  >
                    <option value="">Choose a traced amount…</option>
                    {traceableMovements.map((movement) => (
                      <option
                        key={String(movement.id)}
                        value={String(movement.id)}
                      >
                        {String(
                          movement.to_account || "Account not yet identified",
                        )}{" "}
                        · {rupee(movement.amount)} ·{" "}
                        {movementStatusLabel[
                          String(movement.movement_status)
                        ] || String(movement.movement_status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount
                  <input
                    type="number"
                    min={1}
                    max={
                      activeTraceMovement
                        ? Number(activeTraceMovement.amount)
                        : undefined
                    }
                    value={traceAmount}
                    onChange={(event) => setTraceAmount(event.target.value)}
                    placeholder={
                      activeTraceMovement
                        ? `Up to ${rupee(activeTraceMovement.amount)}`
                        : "Select a traced amount first"
                    }
                    disabled={!activeTraceMovement}
                  />
                </label>
                <label>
                  Outcome
                  <select
                    value={traceStatus}
                    onChange={(event) =>
                      setTraceStatus(
                        event.target.value as
                          "secured" | "tracing" | "unrecovered",
                      )
                    }
                  >
                    <option value="secured">Secured</option>
                    <option value="tracing">Still tracing</option>
                    <option value="unrecovered">Unrecovered</option>
                  </select>
                </label>
                <label>
                  Destination
                  <select
                    value={traceInstitution}
                    onChange={(event) =>
                      setTraceInstitution(event.target.value)
                    }
                  >
                    <option value="">Same account</option>
                    {institutions.map((institution) => (
                      <option key={institution.id} value={institution.id}>
                        To {institution.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn"
                  onClick={trace}
                  disabled={
                    Boolean(busy) || !activeTraceMovement || !traceAmount
                  }
                >
                  {busy === "trace" ? "Recording…" : "Record split"}
                </button>
              </div>
            </div>
          )}
          <div className="card">
            <div className="label">Case actions</div>
            <div className="action-stack">
              {actionButtons.map(([label, action, disabled]) => (
                <button
                  key={action}
                  className="btn secondary"
                  onClick={() => act(action)}
                  disabled={Boolean(busy) || disabled}
                >
                  {busy === action ? "Recording…" : label}
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="label">FIR</div>
            <strong>
              {firStatusLabel[String(fir.fir_status || "not_started")] ||
                "Not started"}
            </strong>
            {Boolean(fir.fir_number) && <p>{String(fir.fir_number)}</p>}
          </div>
          <details className="card secondary-detail">
            <summary>Bank, police and reporting tasks</summary>
            {(detail.integrationJobs || []).length ? (
              <div className="timeline">
                {(detail.integrationJobs || []).map((job) => (
                  <div className="event" key={String(job.id)}>
                    <time>{when(job.created_at)}</time>
                    <strong>{jobTitle(job)}</strong>
                    <p>
                      {jobStatusLabel(job.status)}
                      {job.external_reference
                        ? ` · ${String(job.external_reference)}`
                        : ""}
                      {job.last_error ? ` · ${String(job.last_error)}` : ""}
                    </p>
                    <p className="secondary-meta">
                      {String(job.provider)} ·{" "}
                      {String(job.action).replaceAll("_", " ")} ·{" "}
                      {String(job.status)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                No bank, police or reporting tasks for this case yet. Those
                tasks appear here when a freeze, police assignment or official
                complaint is sent
                {httpIntegrations ? " over the sandbox connection." : "."}
              </p>
            )}
          </details>
          <details className="card secondary-detail">
            <summary>Evidence requests and SLA detail</summary>
            <div className="label">Evidence requests</div>
            <strong>
              {
                detail.evidenceRequests.filter((item) => item.status === "open")
                  .length
              }{" "}
              needed from the citizen ·{" "}
              {
                detail.evidenceRequests.filter(
                  (item) => item.status === "submitted",
                ).length
              }{" "}
              with the team
            </strong>
            <div className="label" style={{ marginTop: 12 }}>
              Deadline calculation
            </div>
            <strong>{String(detail.sla.label)}</strong>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              Taken from recorded freeze and response times. A late response is
              escalated automatically.
            </p>
            <span className="badge">
              {String(detail.sla.status).replaceAll("_", " ")}
            </span>
          </details>
        </aside>
      </main>
    </>
  );
}

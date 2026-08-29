"use client";

import { useMemo, useState } from "react";
import type { CaseDetail } from "@/lib/types";

type Row = Record<string, unknown>;
type SimpleAction =
  | "START_INVESTIGATION"
  | "ACCEPT_EVIDENCE"
  | "START_FIR_REVIEW"
  | "REGISTER_FIR"
  | "ESCALATE_CASE"
  | "RESOLVE_CASE"
  | "CLOSE_CASE";
const rupee = (value: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
const when = (value: unknown) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(String(value)));

export function OperationsClient({
  cases,
  initialDetail,
  operatorName,
}: {
  cases: Row[];
  initialDetail: CaseDetail;
  operatorName: string;
}) {
  const [rows, setRows] = useState(cases);
  const [detail, setDetail] = useState(initialDetail);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [stage, setStage] = useState("all");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const selected = detail.case as Row;
  const fir = detail.fir as Row;
  const selectedCaseId = String(selected.public_case_id);
  const isGolden = selectedCaseId === "NCRP-26-847193";
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        const haystack =
          `${row.public_case_id} ${row.full_name} ${row.case_type} ${row.current_owner_name}`.toLowerCase();
        return (
          haystack.includes(query.toLowerCase()) &&
          (priority === "all" || row.priority === priority) &&
          (stage === "all" || row.case_status === stage)
        );
      }),
    [rows, query, priority, stage],
  );
  const stages = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => String(row.case_status)))).sort(),
    [rows],
  );
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
    if (!response.ok)
      return setMessage(data.error || "Case detail could not be loaded.");
    setDetail(data);
  };
  const secure = async () => {
    setBusy("secure");
    setMessage("");
    const response = await fetch("/api/operations/secure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: selectedCaseId, amount: 6700 }),
    });
    const data = await response.json();
    setBusy("");
    if (!response.ok)
      return setMessage(data.error || "Action could not be completed.");
    updateDetail(
      data,
      "Recorded ₹6,700 as secured. The movement, event, audit record and citizen notification were persisted and broadcast live.",
    );
  };
  const act = async (action: SimpleAction | "REQUEST_EVIDENCE") => {
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
      body: JSON.stringify({ caseId: selectedCaseId, action: actionPayload }),
    });
    const data = await response.json();
    setBusy("");
    if (!response.ok)
      return setMessage(data.error || "Action could not be completed.");
    updateDetail(
      data,
      `${action.replaceAll("_", " ")} recorded. Event, audit and citizen notification updates were written.`,
    );
  };
  const reset = async () => {
    setBusy("reset");
    const response = await fetch("/api/demo/reset", { method: "POST" });
    if (response.ok) location.reload();
    else {
      setBusy("");
      setMessage("Reset failed. Please retry.");
    }
  };
  const hasOpen = detail.evidenceRequests.some(
    (request) => request.status === "open",
  );
  const hasSubmitted = detail.evidenceRequests.some(
    (request) => request.status === "submitted",
  );
  const actionButtons: [string, SimpleAction | "REQUEST_EVIDENCE", boolean][] =
    [
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
      <div className="notice">
        Operations demo · Independent hackathon prototype. External banking,
        police, FIR and reporting systems are simulated behind adapters.
      </div>
      <header className="dash-head">
        <div className="shell case-title">
          <div>
            <div className="crumb">
              Operations console · signed in as {operatorName}
            </div>
            <h1>Case coordination queue</h1>
            <div>
              Every change is a validated domain action, never a direct status
              edit.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a
              className="btn secondary"
              href={`/case/${selectedCaseId}`}
              target="_blank"
            >
              Open citizen view
            </a>
            <button
              className="btn secondary"
              onClick={reset}
              disabled={Boolean(busy)}
            >
              Reset demo
            </button>
          </div>
        </div>
      </header>
      <main className="shell main-grid">
        <section>
          <div className="card section">
            <div className="case-title">
              <div>
                <div className="label">Prioritized cases</div>
                <h2 style={{ margin: "4px 0 0" }}>Live case queue</h2>
              </div>
              <span className="badge">
                {visibleRows.length} of {rows.length} cases
              </span>
            </div>
            <div className="queue-filters">
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
            <div className="money">
              <div className="metric-box">
                <div className="metric stat-green">
                  {rupee(selected.secured_amount)}
                </div>
                <div className="label">Secured</div>
              </div>
              <div className="metric-box">
                <div className="metric stat-amber">
                  {rupee(selected.tracing_amount)}
                </div>
                <div className="label">Tracing</div>
              </div>
              <div className="metric-box">
                <div className="metric stat-red">
                  {rupee(selected.unrecovered_amount)}
                </div>
                <div className="label">Unrecovered</div>
              </div>
              <div className="metric-box">
                <div className="owner">
                  {String(selected.current_owner_name)}
                </div>
                <div className="label">Current owner</div>
              </div>
            </div>
          </div>
          <div className="card section">
            <h2>Internal audit activity</h2>
            {detail.audits?.length ? (
              <div className="timeline">
                {detail.audits.map((entry) => (
                  <div className="event" key={String(entry.id)}>
                    <time>{when(entry.created_at)}</time>
                    <strong>{String(entry.action).replaceAll("_", " ")}</strong>
                    <p>
                      {String(entry.actor_name)} · immutable operator audit
                      entry
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                No operator actions have been recorded since the last reset.
              </div>
            )}
          </div>
        </section>
        <aside className="aside">
          {isGolden && (
            <div className="card">
              <div className="label">Golden-path action</div>
              <h2 style={{ margin: "6px 0" }}>Secure ₹6,700</h2>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                Calls the simulated bank adapter, validates the traceable
                movement, then atomically writes the result.
              </p>
              <button
                className="btn"
                style={{ width: "100%" }}
                onClick={secure}
                disabled={
                  Boolean(busy) || Number(selected.secured_amount) >= 37900
                }
              >
                {busy === "secure"
                  ? "Writing event…"
                  : Number(selected.secured_amount) >= 37900
                    ? "₹6,700 secured"
                    : "Secure ₹6,700"}
              </button>
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
              {String(fir.fir_status || "not_started").replaceAll("_", " ")}
            </strong>
            {Boolean(fir.fir_number) && <p>{String(fir.fir_number)}</p>}
            <div className="label" style={{ marginTop: 12 }}>
              Evidence requests
            </div>
            <strong>
              {
                detail.evidenceRequests.filter((item) => item.status === "open")
                  .length
              }{" "}
              open ·{" "}
              {
                detail.evidenceRequests.filter(
                  (item) => item.status === "submitted",
                ).length
              }{" "}
              submitted
            </strong>
          </div>
          <div className="card">
            <div className="label">Institutional SLA</div>
            <strong>{String(detail.sla.label)}</strong>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              Evaluated from persisted event timestamps. Overdue waits create
              SLA and escalation events automatically.
            </p>
            <span className="badge">
              {String(detail.sla.status).replaceAll("_", " ")}
            </span>
          </div>
          {message && (
            <div
              className={
                message.includes("recorded") || message.startsWith("Recorded")
                  ? "success"
                  : "error"
              }
              role="status"
            >
              {message}
            </div>
          )}
        </aside>
      </main>
    </>
  );
}

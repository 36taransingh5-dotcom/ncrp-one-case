"use client";
import { useEffect, useState } from "react";
import type { CaseDetail } from "@/lib/types";
type Row = Record<string, unknown>;
const rupee = (n: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
const time = (value: unknown) =>
  new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  }).format(new Date(String(value)));
const eventCopy: Record<string, string> = {
  CASE_CREATED: "Complaint received",
  INCIDENT_CLASSIFIED: "Report structured",
  TRANSACTION_IDENTIFIED: "Transaction identified",
  SENDER_BANK_NOTIFIED: "Sender bank notified",
  BENEFICIARY_BANK_IDENTIFIED: "Beneficiary bank identified",
  FREEZE_REQUEST_CREATED: "Freeze request sent",
  FUNDS_PARTIALLY_SECURED: "Funds partially secured",
  FUNDS_SECURED: "Additional funds secured",
  CYBER_CELL_ASSIGNED: "Cyber Crime Unit assigned",
  INVESTIGATION_STARTED: "Investigation started",
  EVIDENCE_REQUESTED: "Evidence requested",
  EVIDENCE_UPLOADED: "Evidence received",
  EVIDENCE_ACCEPTED: "Evidence accepted",
  FIR_REVIEW_STARTED: "FIR review started",
  FIR_REGISTERED: "FIR registered",
  CASE_ESCALATED: "Case escalated",
  CASE_RESOLVED: "Case moved to resolution",
  CASE_CLOSED: "Case closed",
};

export function CitizenCaseClient({
  initial,
  caseId,
}: {
  initial: CaseDetail;
  caseId: string;
}) {
  const [detail, setDetail] = useState(initial),
    [connection, setConnection] = useState("Live updates connected"),
    [uploading, setUploading] = useState(false),
    [message, setMessage] = useState("");
  const reload = async () => {
    const response = await fetch(`/api/cases/${caseId}`, { cache: "no-store" });
    if (response.ok) setDetail(await response.json());
  };
  useEffect(() => {
    const source = new EventSource("/api/realtime");
    source.onopen = () => setConnection("Live updates connected");
    source.onerror = () => setConnection("Live updates reconnecting");
    source.onmessage = async (event) => {
      const payload = JSON.parse(event.data);
      if (payload.caseId === String(initial.case.id)) {
        await reload();
        setMessage("Your case has just been updated.");
      }
    };
    return () => source.close();
  }, [caseId, initial.case.id]);
  const c = detail.case as Row,
    incident = detail.incident as Row,
    fir = detail.fir as Row,
    openRequest = detail.evidenceRequests.find(
      (request) => request.status === "open",
    ),
    unread = detail.notifications.filter(
      (notification) => !notification.read_at,
    );
  const onUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    form.set("caseId", caseId);
    const response = await fetch("/api/evidence", {
      method: "POST",
      body: form,
    });
    const data = await response.json();
    setUploading(false);
    setMessage(
      data.error ||
        "Evidence received. Its integrity fingerprint has been recorded.",
    );
    if (response.ok) {
      await reload();
      event.currentTarget.reset();
    }
  };
  const markRead = async () => {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId }),
    });
    await reload();
  };
  const sourceAccount = String(
    detail.movements.find((movement) => movement.source_account)
      ?.source_account || "Reported source account",
  );
  return (
    <>
      <div className="notice">
        Independent hackathon prototype — not an official government service.
        All case data and integrations shown here are synthetic or simulated.
      </div>
      <header className="dash-head">
        <div className="shell">
          <div className="case-title">
            <div>
              <div className="crumb">
                Citizen case command centre ·{" "}
                <span aria-live="polite">{connection}</span>
              </div>
              <h1>{String(c.public_case_id)}</h1>
              <div>
                {String(incident.fraud_type)}{" "}
                <span className="badge">{String(c.current_stage)}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn secondary"
                onClick={() =>
                  navigator.clipboard.writeText(String(c.public_case_id))
                }
              >
                Share case reference
              </button>
              <a href="/" className="btn secondary">
                Exit demo
              </a>
            </div>
          </div>
        </div>
      </header>
      <main className="shell main-grid">
        <section>
          <div className="card section">
            <div className="label">Money tracked across this case</div>
            <div className="money" style={{ marginTop: 12 }}>
              <div className="metric-box">
                <div className="metric">{rupee(c.reported_amount)}</div>
                <div className="label">Reported stolen</div>
              </div>
              <div className="metric-box">
                <div className="metric stat-green">
                  {rupee(c.secured_amount)}
                </div>
                <div className="label">Secured</div>
              </div>
              <div className="metric-box">
                <div className="metric stat-amber">
                  {rupee(c.tracing_amount)}
                </div>
                <div className="label">Tracing</div>
              </div>
              <div className="metric-box">
                <div className="metric stat-red">
                  {rupee(c.unrecovered_amount)}
                </div>
                <div className="label">Unrecovered</div>
              </div>
            </div>
          </div>
          {message && (
            <div
              className={
                message.includes("failed") || message.includes("Use a")
                  ? "error"
                  : "success"
              }
              role="status"
              style={{ marginBottom: 18 }}
            >
              {message}
            </div>
          )}
          <div className="card section action">
            <div>
              <div className="label">Current action</div>
              <h2 style={{ margin: "6px 0" }}>
                {openRequest
                  ? "Action required"
                  : "Nothing needed from you right now."}
              </h2>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                {openRequest
                  ? String(openRequest.description)
                  : "The case is following remaining traceable funds while the assigned team progresses its review."}
              </p>
            </div>
            <div className="badge">
              {openRequest ? "Evidence requested" : "Case is active"}
            </div>
          </div>
          <div className="card section">
            <h2>Money trail</h2>
            <p style={{ color: "var(--muted)", marginTop: -10 }}>
              All nodes and values below are generated from persisted fund
              movements.
            </p>
            <div className="trail-network">
              <div className="node">
                <strong>{sourceAccount}</strong>
                <div className="label">Reported source</div>
                <div className="amount">{rupee(c.reported_amount)}</div>
              </div>
              <div className="arrow" aria-hidden>
                →
              </div>
              <div className="movement-grid">
                {detail.movements.length ? (
                  detail.movements.map((movement) => (
                    <div
                      className={`node ${String(movement.movement_status)}`}
                      key={String(movement.id)}
                    >
                      <strong>
                        {String(
                          movement.destination_account ||
                            "Destination being identified",
                        )}
                      </strong>
                      <div className="label">
                        {String(movement.movement_status).replaceAll("_", " ")}
                      </div>
                      <div className="amount">{rupee(movement.amount)}</div>
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    The destination is still being identified.
                  </div>
                )}
              </div>
            </div>
            <p className="footer-note" style={{ padding: 0, marginBottom: 0 }}>
              Fund movement data is simulated behind replaceable bank adapters.
            </p>
          </div>
          <div className="card section">
            <h2>Case activity</h2>
            <div className="timeline">
              {detail.events
                .filter((event) => Number(event.citizen_visible))
                .map((event) => {
                  const payload = event.payload_json as Row;
                  return (
                    <article className="event" key={String(event.id)}>
                      <time>{time(event.occurred_at)}</time>
                      <strong>
                        {String(
                          payload?.label ||
                            eventCopy[String(event.event_type)] ||
                            event.event_type,
                        )}
                      </strong>
                      <p>
                        {event.institution_name
                          ? `${String(event.institution_name)} · `
                          : ""}
                        Recorded in this case’s event history.
                      </p>
                    </article>
                  );
                })}
            </div>
          </div>
          <div className="card section">
            <h2>Evidence locker</h2>
            <p style={{ color: "var(--muted)" }}>
              Evidence is stored with an SHA-256 integrity fingerprint. This is
              not a formal forensic certification.
            </p>
            {detail.evidenceRequests.map((request) => (
              <div
                className="metric-box"
                key={String(request.id)}
                style={{ marginBottom: 14 }}
              >
                <strong>{String(request.title)}</strong>
                <p style={{ margin: "4px 0", color: "var(--muted)" }}>
                  {String(request.description)}
                </p>
                <span className="badge">{String(request.status)}</span>
              </div>
            ))}
            <form className="form" onSubmit={onUpload}>
              <label>
                Evidence title
                <input
                  required
                  name="title"
                  placeholder="Bank statement, 28–29 August"
                />
              </label>
              <label>
                File
                <input
                  required
                  name="file"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                />
              </label>
              <button className="btn" disabled={uploading}>
                {uploading ? "Recording fingerprint…" : "Upload evidence"}
              </button>
            </form>
            {detail.evidence.map((item) => (
              <div
                className="metric-box"
                key={String(item.id)}
                style={{ marginTop: 12 }}
              >
                <strong>{String(item.title)}</strong>
                <div className="label">
                  SHA-256 · {String(item.sha256).slice(0, 16)}…
                </div>
              </div>
            ))}
          </div>
        </section>
        <aside className="aside">
          <div className="card">
            <div className="label">Current owner</div>
            <div className="owner">{String(c.current_owner_name)}</div>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              The team currently responsible for the next case action.
            </p>
          </div>
          <div className="card">
            <div className="case-title">
              <div>
                <div className="label">Notifications</div>
                <div className="owner">{unread.length} unread</div>
              </div>
              {unread.length > 0 && (
                <button className="btn secondary" onClick={markRead}>
                  Mark read
                </button>
              )}
            </div>
            {detail.notifications.slice(0, 3).map((notification) => (
              <div className="notification" key={String(notification.id)}>
                <strong>{String(notification.title)}</strong>
                <p>{String(notification.body)}</p>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="label">FIR status</div>
            <div className="owner">
              {String(fir.fir_status || "not_started").replaceAll("_", " ")}
            </div>
            {Boolean(fir.fir_number) && (
              <p>
                <strong>{String(fir.fir_number)}</strong>
              </p>
            )}
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              {String(
                fir.reason ||
                  "An update will appear here when one is recorded.",
              )}
            </p>
          </div>
          <div className="card">
            <div className="label">Agency handoffs</div>
            {detail.assignments.length ? (
              detail.assignments.map((assignment) => (
                <div className="progress-step" key={String(assignment.id)}>
                  <span className="dot done" />
                  {String(assignment.institution_name)}
                </div>
              ))
            ) : (
              <div className="empty">Assignment is pending.</div>
            )}
          </div>
          <div className="card">
            <div className="label">Last recorded update</div>
            <strong>{time(c.last_activity_at)}</strong>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>
              This prototype does not contact real institutions or file a real
              complaint.
            </p>
          </div>
        </aside>
      </main>
    </>
  );
}

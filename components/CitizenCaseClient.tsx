"use client";

import { useEffect, useRef, useState } from "react";
import type { CaseDetail } from "@/lib/types";

type Row = Record<string, unknown>;

const rupee = (value: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const time = (value: unknown) =>
  new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  }).format(new Date(String(value)));

const eventCopy: Record<string, string> = {
  CASE_CREATED: "Complaint received",
  INCIDENT_CLASSIFIED: "Report understood",
  TRANSACTION_IDENTIFIED: "Transaction identified",
  SENDER_BANK_NOTIFIED: "Sender bank notified",
  BENEFICIARY_BANK_IDENTIFIED: "Beneficiary bank identified",
  FREEZE_REQUEST_CREATED: "Freeze request sent",
  FUNDS_PARTIALLY_SECURED: "Funds secured",
  FUNDS_SECURED: "Additional funds secured",
  FUNDS_MOVED: "Funds moved to a secondary account",
  FUNDS_WITHDRAWN: "Funds marked unrecovered after withdrawal",
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

const statusDescription: Record<string, string> = {
  secured: "Protected by a recorded hold",
  tracing: "Still being traced",
  moved: "Moved onward and under review",
  unrecovered: "Reported as withdrawn or unrecovered",
  withdrawn: "Reported as withdrawn or unrecovered",
};

function ownerName(owner: unknown) {
  return String(owner || "the assigned team").replace(/\s*\(simulated\)/i, "");
}

export function CitizenCaseClient({
  initial,
  caseId,
}: {
  initial: CaseDetail;
  caseId: string;
}) {
  const [detail, setDetail] = useState(initial);
  const detailRef = useRef(initial);
  const [connection, setConnection] = useState("Live updates connected");
  const [uploading, setUploading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [message, setMessage] = useState("");
  const [liveUpdate, setLiveUpdate] = useState("");

  const applyDetail = (next: CaseDetail, fromRealtime = false) => {
    const prior = detailRef.current;
    const securedDelta =
      Number(next.case.secured_amount || 0) -
      Number(prior.case.secured_amount || 0);
    detailRef.current = next;
    setDetail(next);
    if (fromRealtime && securedDelta > 0) {
      setLiveUpdate(`${rupee(securedDelta)} additional funds secured`);
      setMessage("Your case has just been updated.");
    } else if (fromRealtime) {
      setLiveUpdate("A new case update has arrived");
      setMessage("Your case has just been updated.");
    }
  };

  const reload = async (fromRealtime = false) => {
    try {
      const response = await fetch(`/api/cases/${caseId}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        setSessionExpired(true);
        setConnection("Live updates paused");
        setMessage(
          "Your demo session has ended. Re-enter the citizen demo to continue.",
        );
        return;
      }
      if (!response.ok) {
        setMessage(
          "We could not refresh the case. Check your connection and retry.",
        );
        return;
      }
      setSessionExpired(false);
      applyDetail(await response.json(), fromRealtime);
    } catch {
      setMessage(
        "We could not refresh the case. Check your connection and retry.",
      );
    }
  };

  useEffect(() => {
    const source = new EventSource("/api/realtime");
    source.onopen = () => setConnection("Live updates connected");
    source.onerror = () => setConnection("Live updates reconnecting");
    source.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.caseId === String(initial.case.id)) await reload(true);
      } catch {
        setConnection("Live updates reconnecting");
      }
    };
    return () => source.close();
  }, [caseId, initial.case.id]);

  const c = detail.case as Row;
  const incident = detail.incident as Row;
  const fir = detail.fir as Row;
  const openRequest = detail.evidenceRequests.find(
    (request) => request.status === "open",
  );
  const unread = detail.notifications.filter(
    (notification) => !notification.read_at,
  );
  const primaryAccount = String(
    detail.movements.find(
      (movement) =>
        movement.destination_account &&
        movement.destination_account !== "ATM withdrawal",
    )?.destination_account || "Beneficiary account being identified",
  );
  const currentOwner = ownerName(c.current_owner_name);
  const ownerDoing = openRequest
    ? "The assigned team needs one document to continue its review."
    : "The assigned team is coordinating the next protective action and tracing any remaining funds.";

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
    try {
      const response = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId }),
      });
      if (!response.ok) throw new Error();
      await reload();
    } catch {
      setMessage("Notifications could not be updated. Please try again.");
    }
  };

  const shareReference = async () => {
    try {
      await navigator.clipboard.writeText(String(c.public_case_id));
      setMessage(
        "Case reference copied. Share it only with the relevant support team.",
      );
    } catch {
      setMessage(
        "We could not copy the reference. Select the case ID and copy it manually.",
      );
    }
  };

  return (
    <>
      <div className="notice">
        Independent hackathon prototype — not an official government service.
        All identities, institutions, transactions and actions are synthetic or
        simulated.
      </div>
      <header className="dash-head">
        <div className="shell case-title citizen-nav">
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
          <div className="case-actions">
            <a href={`/api/cases/${caseId}/summary`} className="btn secondary">
              Download summary
            </a>
            <button className="btn secondary" onClick={shareReference}>
              Share case reference
            </button>
            <a href="/" className="btn secondary">
              Exit demo
            </a>
          </div>
        </div>
      </header>

      <main className="shell citizen-main">
        <section
          className="case-overview"
          aria-labelledby="case-overview-heading"
        >
          <div className="case-overview-intro">
            <div className="eyebrow">Your case at a glance</div>
            <h2 id="case-overview-heading">
              We are tracking every reported rupee.
            </h2>
            <p>
              Amounts below are derived from the recorded fund movements in this
              case.
            </p>
          </div>
          <div className="reported-loss">
            <span className="label">Reported stolen</span>
            <strong>{rupee(c.reported_amount)}</strong>
            <span>Reported financial cyber fraud</span>
          </div>
          <div className="recovery-breakdown" aria-label="Recovery state">
            <div className="recovery-line secured">
              <span>Secured</span>
              <strong>{rupee(c.secured_amount)}</strong>
              <small>Protected by a recorded hold</small>
            </div>
            <div className="recovery-line tracing">
              <span>Tracing</span>
              <strong>{rupee(c.tracing_amount)}</strong>
              <small>Still being traced</small>
            </div>
            <div className="recovery-line unrecovered">
              <span>Unrecovered</span>
              <strong>{rupee(c.unrecovered_amount)}</strong>
              <small>Reported as withdrawn or unrecovered</small>
            </div>
          </div>
        </section>

        {liveUpdate && (
          <div className="live-impact" role="status" aria-live="assertive">
            <span className="live-dot" aria-hidden />
            <div>
              <strong>{liveUpdate}</strong>
              <span>
                {" "}
                Live case update received without refreshing this page.
              </span>
            </div>
          </div>
        )}
        {message && (
          <div
            className={
              message.includes("could not") || message.includes("ended")
                ? "error"
                : "success"
            }
            role="status"
          >
            {message}
          </div>
        )}
        {sessionExpired && (
          <div className="card section recovery-card">
            <h2>Re-enter the demo to continue</h2>
            <p>Your signed demo session expired. No case data has been lost.</p>
            <a className="btn" href="/">
              Return to demo entry
            </a>
          </div>
        )}

        <section
          className="ownership-grid"
          aria-label="Current case responsibility"
        >
          <article className="owner-spotlight">
            <div className="label">Current owner</div>
            <h2>Waiting for {currentOwner}</h2>
            <p>{ownerDoing}</p>
            <div className="owner-meta">
              <span>Next action</span>
              <strong>
                {openRequest
                  ? "Citizen evidence requested"
                  : "Institutional response and fund tracing"}
              </strong>
            </div>
          </article>
          <article className={`sla-spotlight ${String(detail.sla.status)}`}>
            <div className="label">Institutional response</div>
            <h2>{String(detail.sla.label)}</h2>
            {Boolean(detail.sla.requestedAt) && (
              <p>
                Freeze acknowledgement requested at{" "}
                {time(detail.sla.requestedAt)}.
              </p>
            )}
            {Boolean(detail.sla.deadlineAt) && (
              <p>Expected response by {time(detail.sla.deadlineAt)}.</p>
            )}
            <span className="badge">
              {String(detail.sla.status).replaceAll("_", " ")}
            </span>
            {connection !== "Live updates connected" && (
              <button
                className="btn secondary"
                onClick={() => reload()}
                style={{ marginTop: 12 }}
              >
                Refresh case
              </button>
            )}
          </article>
          <article
            className={`citizen-action ${openRequest ? "required" : "clear"}`}
          >
            <div className="label">What you need to do</div>
            <h2>
              {openRequest ? "Action required" : "Nothing needed right now"}
            </h2>
            <p>
              {openRequest
                ? String(openRequest.description)
                : "You do not need to contact any institution. We will show the next update here."}
            </p>
          </article>
        </section>

        <section
          className="card flow-section"
          aria-labelledby="money-trail-heading"
        >
          <div className="section-heading">
            <div>
              <div className="eyebrow">Fund investigation</div>
              <h2 id="money-trail-heading">Money trail</h2>
            </div>
            <p>Each branch is generated from a persisted fund movement.</p>
          </div>
          <div
            className="money-flow"
            aria-label="Persisted money flow from reported source through beneficiary accounts"
          >
            <article className="flow-account source-account">
              <span className="label">Reported source</span>
              <strong>
                {String(
                  detail.movements.find((movement) => movement.source_account)
                    ?.source_account || "Reported source account",
                )}
              </strong>
              <b>{rupee(c.reported_amount)}</b>
            </article>
            <div className="flow-stem" aria-hidden>
              <span>Funds reported</span>
            </div>
            <article className="flow-account primary-account">
              <span className="label">Primary beneficiary</span>
              <strong>{primaryAccount}</strong>
              <b>{rupee(c.reported_amount)}</b>
              <small>Recorded destination under investigation</small>
            </article>
            <div className="flow-branches">
              {detail.movements.map((movement) => {
                const state = String(movement.movement_status);
                return (
                  <article
                    className={`flow-branch ${state}`}
                    key={String(movement.id)}
                  >
                    <div className="branch-connector" aria-hidden />
                    <div className="flow-branch-card">
                      <span className="state-pill">
                        {state.replaceAll("_", " ")}
                      </span>
                      <strong>
                        {String(
                          movement.destination_account ||
                            "Destination being identified",
                        )}
                      </strong>
                      <b>{rupee(movement.amount)}</b>
                      <small>
                        {statusDescription[state] || "Under case review"}
                      </small>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
          <p className="footer-note">
            Fund movement data is simulated behind replaceable bank adapters. No
            real accounts or institutions are contacted.
          </p>
        </section>

        <div className="citizen-content-grid">
          <section className="card section timeline-section">
            <div className="section-heading">
              <div>
                <div className="eyebrow">Service progress</div>
                <h2>Case activity</h2>
              </div>
            </div>
            <div className="timeline">
              {detail.events
                .filter((event) => Number(event.citizen_visible))
                .map((event, index) => {
                  const payload = event.payload_json as Row;
                  const label = String(
                    payload?.label ||
                      eventCopy[String(event.event_type)] ||
                      event.event_type,
                  );
                  return (
                    <article
                      className={`event ${index === 0 ? "latest" : ""}`}
                      key={String(event.id)}
                    >
                      <time>{time(event.occurred_at)}</time>
                      <strong>{label}</strong>
                      <p>
                        {event.institution_name
                          ? `${String(event.institution_name)} is handling this update.`
                          : "This update has been added to your case."}
                      </p>
                    </article>
                  );
                })}
            </div>
          </section>

          <aside className="citizen-aside">
            <section className="card section">
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
            </section>
            <section className="card section">
              <div className="label">FIR status</div>
              <div className="owner">
                {String(fir.fir_status || "not_started").replaceAll("_", " ")}
              </div>
              {Boolean(fir.fir_number) && (
                <p>
                  <strong>{String(fir.fir_number)}</strong>
                </p>
              )}
              <p>
                {String(
                  fir.reason ||
                    "An update will appear here when one is recorded.",
                )}
              </p>
            </section>
            <section className="card section">
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
            </section>
          </aside>
        </div>

        <section className="card section evidence-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Evidence locker</div>
              <h2>Evidence and requested documents</h2>
            </div>
            <p>Files receive a SHA-256 integrity fingerprint when stored.</p>
          </div>
          {detail.evidenceRequests.map((request) => (
            <div className="metric-box" key={String(request.id)}>
              <strong>{String(request.title)}</strong>
              <p>{String(request.description)}</p>
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
            <div className="metric-box" key={String(item.id)}>
              <strong>{String(item.title)}</strong>
              <div className="label">
                SHA-256 · {String(item.sha256).slice(0, 16)}…
              </div>
              <a
                className="rowlink"
                href={`/api/evidence/${String(item.id)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open stored evidence
              </a>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CaseDetail } from "@/lib/types";
import { buildFundFlow, type FundMovementRow } from "@/lib/domain/fund-graph";
import { MoneyTrail } from "@/components/MoneyTrail";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Row = Record<string, unknown>;

const rupee = (value: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

// Pinned to IST so the server-rendered markup and the browser agree, and so
// times read the way an Indian citizen expects regardless of server timezone.
const clock = (value: unknown) =>
  new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date(String(value)));

const dayAndClock = (value: unknown) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date(String(value)));

function duration(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Response windows are round numbers, so say "2 hours", not "2h 0m". */
function windowLabel(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return duration(ms);
}

const stageLabel: Record<string, string> = {
  REPORTED: "Report received",
  FINANCIAL_INTERVENTION: "Protecting the money",
  FUNDS_TRACING: "Tracing the money",
  PARTIALLY_SECURED: "Part of the money is secured",
  INVESTIGATION: "Under investigation",
  FIR_REVIEW: "FIR under review",
  FIR_REGISTERED: "FIR registered",
  RESOLUTION: "Moving to resolution",
  CLOSED: "Case closed",
};

const eventTitle: Record<string, string> = {
  CASE_CREATED: "Complaint received",
  INCIDENT_CLASSIFIED: "Report understood",
  TRANSACTION_IDENTIFIED: "Transaction identified",
  SENDER_BANK_NOTIFIED: "Your bank notified",
  BENEFICIARY_BANK_IDENTIFIED: "Beneficiary bank identified",
  FREEZE_REQUEST_CREATED: "Freeze request sent",
  FUNDS_PARTIALLY_SECURED: "Funds secured",
  FUNDS_SECURED: "Additional funds secured",
  FUNDS_MOVED: "Money traced onward",
  FUNDS_WITHDRAWN: "Money withdrawn",
  CYBER_CELL_ASSIGNED: "Cyber Crime Unit assigned",
  INVESTIGATION_STARTED: "Investigation started",
  EVIDENCE_REQUESTED: "Document requested",
  EVIDENCE_UPLOADED: "Your document received",
  EVIDENCE_ACCEPTED: "Your document accepted",
  FIR_REVIEW_STARTED: "FIR review started",
  FIR_REGISTERED: "FIR registered",
  SLA_BREACHED: "Response deadline missed",
  CASE_ESCALATED: "Case escalated",
  CASE_RESOLVED: "Case moved to resolution",
  CASE_CLOSED: "Case closed",
};

/** One plain sentence per step, so the timeline reads as a service journey. */
const eventMeaning: Record<string, string> = {
  CASE_CREATED: "Your report became one case that every agency works from.",
  INCIDENT_CLASSIFIED:
    "Your report was organised so the money could be chased straight away.",
  TRANSACTION_IDENTIFIED:
    "The payment that left your account was matched to your report.",
  SENDER_BANK_NOTIFIED: "Your own bank was asked to watch your account.",
  BENEFICIARY_BANK_IDENTIFIED:
    "The account that received your money was traced.",
  FREEZE_REQUEST_CREATED:
    "A hold was requested so this money cannot be moved again.",
  FUNDS_PARTIALLY_SECURED: "This money is now held and cannot be moved.",
  FUNDS_SECURED: "This money is now held and cannot be moved.",
  FUNDS_MOVED:
    "Part of the money was pushed to another account before the hold reached it.",
  FUNDS_WITHDRAWN: "This money was taken out before a hold could be applied.",
  CYBER_CELL_ASSIGNED: "A cyber crime team took over the investigation.",
  INVESTIGATION_STARTED: "The investigation into who did this is under way.",
  EVIDENCE_REQUESTED: "The team asked you for one document.",
  EVIDENCE_UPLOADED: "Your document was added to the case file.",
  EVIDENCE_ACCEPTED: "Your document was checked and accepted.",
  FIR_REVIEW_STARTED:
    "Police are reviewing whether to register an FIR for this case.",
  FIR_REGISTERED: "An FIR has been registered for this case.",
  SLA_BREACHED: "The bank did not answer within the time it was given.",
  CASE_ESCALATED: "The case was pushed up because a response was late.",
  CASE_RESOLVED: "The active work on this case is complete.",
  CASE_CLOSED: "This case has been closed.",
};

const firLabel: Record<string, string> = {
  not_started: "Not started",
  under_review: "Under review",
  registered: "Registered",
  declined: "Not registered",
};

const institutionName = (value: unknown) =>
  String(value || "the assigned team")
    .replace(/\s*\(simulated\)/i, "")
    .replace(/\s*—.*$/, "");

/** Counts a value up to its new target so live changes are legible, not jumpy. */
function useCountUp(target: number) {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    const started = performance.now();
    const span = 900;
    let frame = 0;
    const step = (at: number) => {
      const progress = Math.min(1, (at - started) / span);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return display;
}

export function CitizenCaseClient({
  initial,
  caseId,
  realtimeMode = "sse",
}: {
  initial: CaseDetail;
  caseId: string;
  realtimeMode?: "sse" | "supabase";
}) {
  const [detail, setDetail] = useState(initial);
  const detailRef = useRef(initial);
  const [live, setLive] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{ title: string; body: string } | null>(
    null,
  );
  const [changed, setChanged] = useState<Set<string>>(new Set());
  // Held back until after mount so server and client markup match.
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const applyDetail = (next: CaseDetail, fromRealtime = false) => {
    const prior = detailRef.current;
    detailRef.current = next;
    setDetail(next);
    if (!fromRealtime) return;

    const priorStatus = new Map(
      prior.movements.map((movement) => [
        String(movement.id),
        String(movement.movement_status),
      ]),
    );
    const moved = next.movements
      .filter(
        (movement) =>
          priorStatus.get(String(movement.id)) !== undefined &&
          priorStatus.get(String(movement.id)) !==
            String(movement.movement_status),
      )
      .map((movement) => String(movement.id));
    if (moved.length) {
      setChanged(new Set(moved));
      setTimeout(() => setChanged(new Set()), 4000);
    }

    const securedDelta =
      Number(next.case.secured_amount || 0) -
      Number(prior.case.secured_amount || 0);
    if (securedDelta > 0)
      setToast({
        title: `${rupee(securedDelta)} additional funds secured`,
        body: "This money is now held and cannot be moved.",
      });
    else {
      const latest = next.events[0];
      const type = String(latest?.event_type || "");
      setToast({
        title: eventTitle[type] || "Your case was updated",
        body: eventMeaning[type] || "A new update was added to your case.",
      });
    }
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast]);

  const reload = async (fromRealtime = false) => {
    try {
      const response = await fetch(`/api/cases/${caseId}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        setSessionExpired(true);
        setLive(false);
        setMessage(
          realtimeMode === "supabase"
            ? "Your secure session has ended. Sign in again to continue."
            : "Your demo session has ended. Re-enter the citizen demo to continue.",
        );
        return;
      }
      if (!response.ok) {
        setMessage(
          "We could not refresh your case. Check your connection and try again.",
        );
        return;
      }
      setSessionExpired(false);
      applyDetail(await response.json(), fromRealtime);
    } catch {
      setMessage(
        "We could not refresh your case. Check your connection and try again.",
      );
    }
  };

  useEffect(() => {
    if (realtimeMode === "supabase") {
      const supabase = createSupabaseBrowserClient();
      const channel = supabase
        .channel(`case:${String(initial.case.id)}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "case_events",
          },
          async (payload) => {
            const eventCaseId = String(
              (payload.new as Record<string, unknown>).case_id || "",
            );
            if (eventCaseId === String(initial.case.id)) await reload(true);
          },
        )
        .subscribe((status) => setLive(status === "SUBSCRIBED"));
      return () => {
        void supabase.removeChannel(channel);
      };
    }
    const source = new EventSource("/api/realtime");
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.caseId === String(initial.case.id)) await reload(true);
      } catch {
        setLive(false);
      }
    };
    return () => source.close();
    // `reload` intentionally reads the latest detail through its ref-backed state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, initial.case.id, realtimeMode]);

  const c = detail.case as Row;
  const incident = detail.incident as Row;
  const fir = detail.fir as Row;
  const sla = detail.sla as Row;

  const reported = Number(c.reported_amount || 0);
  const secured = Number(c.secured_amount || 0);
  const tracing = Number(c.tracing_amount || 0);
  const unrecovered = Number(c.unrecovered_amount || 0);
  const shownSecured = useCountUp(secured);
  const shownTracing = useCountUp(tracing);
  const shownUnrecovered = useCountUp(unrecovered);
  const share = (value: number) =>
    reported > 0 ? `${(value / reported) * 100}%` : "0%";

  const flow = useMemo(
    () =>
      buildFundFlow({
        reportedAmount: reported,
        movements: detail.movements as unknown as FundMovementRow[],
      }),
    [detail.movements, reported],
  );

  const openRequest = detail.evidenceRequests.find(
    (request) => request.status === "open",
  );
  const unread = detail.notifications.filter(
    (notification) => !notification.read_at,
  );
  const owner = institutionName(c.current_owner_name);
  const escalated = detail.events.some(
    (event) => event.event_type === "CASE_ESCALATED",
  );

  const slaStatus = String(sla.status || "not_applicable");
  const requestedAt = sla.requestedAt ? String(sla.requestedAt) : null;
  const deadlineAt = sla.deadlineAt ? String(sla.deadlineAt) : null;
  const respondedAt = sla.respondedAt ? String(sla.respondedAt) : null;
  const windowMs =
    requestedAt && deadlineAt
      ? new Date(deadlineAt).getTime() - new Date(requestedAt).getTime()
      : 0;
  const elapsedMs =
    requestedAt && nowMs !== null
      ? nowMs - new Date(requestedAt).getTime()
      : null;
  const overdue = slaStatus === "overdue" || slaStatus === "breached";

  const ownerActivity = overdue
    ? `${owner} has not responded in time, so your case has been pushed up for escalation.`
    : slaStatus === "met"
      ? `The bank has responded. ${owner} now owns the next step on your case.`
      : requestedAt
        ? `${owner} has been asked to hold the money that is still being traced.`
        : `${owner} owns the next action on your case.`;

  const onUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Captured before awaiting: React clears currentTarget once the handler returns.
    const form = event.currentTarget;
    setUploading(true);
    setMessage("");
    const body = new FormData(form);
    body.set("caseId", caseId);
    try {
      const response = await fetch("/api/evidence", { method: "POST", body });
      const data = await response.json();
      setMessage(
        data.error ||
          "Document received. We have recorded it against your case.",
      );
      if (response.ok) {
        form.reset();
        await reload();
      }
    } catch {
      setMessage("We could not upload that document. Please try again.");
    } finally {
      setUploading(false);
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
      setMessage("We could not update your updates list. Please try again.");
    }
  };

  const shareReference = async () => {
    try {
      await navigator.clipboard.writeText(String(c.public_case_id));
      setMessage("Case reference copied.");
    } catch {
      setMessage("We could not copy the reference. Please copy it manually.");
    }
  };

  const visibleEvents = detail.events.filter((event) =>
    Number(event.citizen_visible),
  );

  return (
    <>
      <div className="notice">
        Independent hackathon prototype — not an official government service.
        All identities, institutions, transactions and actions are synthetic.
      </div>

      <header className="case-header">
        <div className="shell case-header-inner">
          <div>
            <div className="case-header-meta">
              <span className={`live-pill${live ? "" : " offline"}`}>
                <span className="live-dot" aria-hidden />
                {live ? "Live" : "Reconnecting"}
              </span>
              <span>Your case</span>
            </div>
            <h1>{String(c.public_case_id)}</h1>
            <p>
              {String(incident.fraud_type)} ·{" "}
              {stageLabel[String(c.case_status)] || String(c.current_stage)}
            </p>
          </div>
          <div className="case-actions">
            <a href={`/api/cases/${caseId}/summary`} className="btn secondary">
              Download summary
            </a>
            <button className="btn secondary" onClick={shareReference}>
              Copy case reference
            </button>
            <a
              href={realtimeMode === "supabase" ? "/cases" : "/"}
              className="btn secondary"
            >
              {realtimeMode === "supabase" ? "Your cases" : "Exit demo"}
            </a>
          </div>
        </div>
      </header>

      <main className="shell citizen-main">
        {toast && (
          <div className="toast" role="status" aria-live="polite">
            <span className="toast-dot" aria-hidden />
            <div>
              <strong>{toast.title}</strong>
              <p>{toast.body}</p>
            </div>
            <button
              className="toast-close"
              onClick={() => setToast(null)}
              aria-label="Dismiss update"
            >
              ×
            </button>
          </div>
        )}

        <section className="money-hero" aria-labelledby="money-hero-heading">
          <div className="money-hero-total">
            <span className="label">Reported stolen</span>
            <strong id="money-hero-heading">{rupee(reported)}</strong>
            <span className="money-hero-sub">
              Reported {dayAndClock(c.opened_at)} · everything below adds up to
              this amount
            </span>
          </div>

          <div
            className="money-bar"
            role="img"
            aria-label={`${rupee(secured)} secured, ${rupee(tracing)} being traced, ${rupee(unrecovered)} unrecovered of ${rupee(reported)} reported`}
          >
            <span className="seg secured" style={{ width: share(secured) }} />
            <span className="seg tracing" style={{ width: share(tracing) }} />
            <span
              className="seg unrecovered"
              style={{ width: share(unrecovered) }}
            />
          </div>

          <dl className="money-split">
            <div className="split secured">
              <dt>
                <span className="split-dot" aria-hidden />
                Secured
              </dt>
              <dd>{rupee(shownSecured)}</dd>
              <p>Held in place and cannot be moved</p>
            </div>
            <div className="split tracing">
              <dt>
                <span className="split-dot" aria-hidden />
                Being traced
              </dt>
              <dd>{rupee(shownTracing)}</dd>
              <p>Located and still being followed</p>
            </div>
            <div className="split unrecovered">
              <dt>
                <span className="split-dot" aria-hidden />
                Unrecovered
              </dt>
              <dd>{rupee(shownUnrecovered)}</dd>
              <p>Taken out before it could be held</p>
            </div>
          </dl>
        </section>

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
          <section className="card section">
            <h2>
              {realtimeMode === "supabase"
                ? "Sign in again to continue"
                : "Re-enter the demo to continue"}
            </h2>
            <p>Your session expired. Nothing in your case has been lost.</p>
            <a
              className="btn"
              href={realtimeMode === "supabase" ? "/auth" : "/"}
            >
              {realtimeMode === "supabase" ? "Sign in" : "Return to demo entry"}
            </a>
          </section>
        )}

        <section className="status-band">
          <article
            className={`your-move${openRequest ? " needed" : " clear"}`}
            aria-labelledby="your-move-heading"
          >
            <span className="label">What you need to do</span>
            <h2 id="your-move-heading">
              {openRequest
                ? String(openRequest.title)
                : "Nothing needed from you right now"}
            </h2>
            <p>
              {openRequest
                ? String(openRequest.description)
                : "You do not need to call or visit any bank or police station. Every update appears on this page."}
            </p>
            {openRequest && (
              <a className="btn" href="#evidence">
                Upload the document
              </a>
            )}
          </article>

          <article
            className={`waiting-on ${overdue ? "overdue" : slaStatus}`}
            aria-labelledby="waiting-on-heading"
          >
            <span className="label">
              {overdue
                ? "Response overdue"
                : slaStatus === "met"
                  ? "Next action with"
                  : "Waiting for"}
            </span>
            <h2 id="waiting-on-heading">{owner}</h2>
            <p>{ownerActivity}</p>

            {requestedAt && (
              <div className="waiting-facts">
                <div>
                  <span>Requested</span>
                  <strong>{clock(requestedAt)}</strong>
                </div>
                <div>
                  <span>{respondedAt ? "Responded" : "Expected response"}</span>
                  <strong>
                    {respondedAt
                      ? clock(respondedAt)
                      : `Within ${windowLabel(windowMs)}`}
                  </strong>
                </div>
                <div>
                  <span>Elapsed</span>
                  <strong>
                    {elapsedMs === null ? "—" : duration(elapsedMs)}
                  </strong>
                </div>
              </div>
            )}

            {requestedAt && !respondedAt && windowMs > 0 && (
              <div className="sla-track" aria-hidden>
                <span
                  className={overdue ? "over" : ""}
                  style={{
                    width:
                      elapsedMs === null
                        ? "0%"
                        : `${Math.min(100, (elapsedMs / windowMs) * 100)}%`,
                  }}
                />
              </div>
            )}

            {overdue && escalated && (
              <p className="escalation">
                Automatic escalation created — a senior desk now owns the delay.
              </p>
            )}
            {!live && (
              <button
                className="btn secondary waiting-refresh"
                onClick={() => reload()}
              >
                Refresh case
              </button>
            )}
          </article>
        </section>

        <section className="card trail-section" aria-labelledby="trail-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Money trail</span>
              <h2 id="trail-heading">Where your money went</h2>
            </div>
            <p>
              See how the reported money moved and what has been secured. Every
              account below is masked.
            </p>
          </div>
          <div className="trail-frame">
            <MoneyTrail root={flow.root} highlighted={changed} />
          </div>
          <p className="trail-scroll-hint" aria-hidden>
            Swipe to see the rest of the trail →
          </p>
          <p className="trail-foot">
            {flow.reconciled
              ? `All ${rupee(reported)} reported is accounted for above.`
              : "Some of the reported amount is still being matched to a transaction."}
          </p>
        </section>

        <div className="citizen-columns">
          <section
            className="card section timeline-card"
            aria-labelledby="timeline-heading"
          >
            <div className="section-heading">
              <div>
                <span className="eyebrow">Progress</span>
                <h2 id="timeline-heading">What has happened so far</h2>
              </div>
            </div>
            <ol className="journey">
              {visibleEvents.map((event, index) => {
                const type = String(event.event_type);
                const payload = event.payload_json as Row;
                const title = String(
                  payload?.label || eventTitle[type] || "Case update",
                );
                return (
                  <li
                    className={`journey-step${index === 0 ? " latest" : ""}`}
                    key={String(event.id)}
                  >
                    <div className="journey-when">
                      <time dateTime={String(event.occurred_at)}>
                        {clock(event.occurred_at)}
                      </time>
                    </div>
                    <div className="journey-body">
                      <strong>{title}</strong>
                      <p>
                        {eventMeaning[type] ||
                          "This update was added to your case."}
                      </p>
                      {Boolean(event.institution_name) && (
                        <span className="journey-tag">
                          {institutionName(event.institution_name)}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <aside className="citizen-aside">
            <section className="card section">
              <div className="aside-head">
                <div>
                  <span className="label">Updates</span>
                  <strong className="aside-value">
                    {unread.length ? `${unread.length} new` : "All read"}
                  </strong>
                </div>
                {unread.length > 0 && (
                  <button className="btn secondary small" onClick={markRead}>
                    Mark read
                  </button>
                )}
              </div>
              {detail.notifications.slice(0, 3).map((notification) => (
                <div className="notification" key={String(notification.id)}>
                  <strong>{String(notification.title)}</strong>
                  <p>{String(notification.body)}</p>
                  <time>{dayAndClock(notification.created_at)}</time>
                </div>
              ))}
              {!detail.notifications.length && (
                <div className="empty">No updates yet.</div>
              )}
            </section>

            <section className="card section">
              <span className="label">Police report (FIR)</span>
              <strong className="aside-value">
                {firLabel[String(fir.fir_status || "not_started")] ||
                  "Not started"}
              </strong>
              {Boolean(fir.fir_number) && (
                <p className="fir-number">{String(fir.fir_number)}</p>
              )}
              <p className="aside-note">
                {fir.fir_status === "under_review"
                  ? "Police are deciding whether to register an FIR. You do not need to visit a station."
                  : fir.fir_status === "registered"
                    ? "An FIR has been registered against this case."
                    : "An update will appear here once police review this case."}
              </p>
            </section>

            <section className="card section">
              <span className="label">Who is on your case</span>
              <div className="handoffs">
                <div className="handoff done">
                  <span className="dot done" />
                  <div>
                    <strong>NCRP One Case</strong>
                    <small>Your report, kept in one place</small>
                  </div>
                </div>
                {detail.assignments.map((assignment) => (
                  <div className="handoff done" key={String(assignment.id)}>
                    <span className="dot done" />
                    <div>
                      <strong>
                        {institutionName(assignment.institution_name)}
                      </strong>
                      <small>
                        Joined {dayAndClock(assignment.assigned_at)}
                      </small>
                    </div>
                  </div>
                ))}
                <div className="handoff current">
                  <span className="dot current" />
                  <div>
                    <strong>{owner}</strong>
                    <small>Owns the next action</small>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>

        <section
          className="card section evidence-section"
          id="evidence"
          aria-labelledby="evidence-heading"
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow">Documents</span>
              <h2 id="evidence-heading">Documents for your case</h2>
            </div>
            <p>
              Anything you upload stays attached to this case and is checked for
              tampering.
            </p>
          </div>

          {detail.evidenceRequests.length > 0 && (
            <div className="request-list">
              {detail.evidenceRequests.map((request) => (
                <div
                  className={`request ${String(request.status)}`}
                  key={String(request.id)}
                >
                  <div>
                    <strong>{String(request.title)}</strong>
                    <p>{String(request.description)}</p>
                  </div>
                  <span className="badge">
                    {String(request.status) === "open"
                      ? "Needed from you"
                      : String(request.status) === "submitted"
                        ? "With the team"
                        : "Accepted"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <form className="form evidence-form" onSubmit={onUpload}>
            <label>
              What is this document?
              <input
                required
                name="title"
                placeholder="Bank statement, 28–29 August"
              />
            </label>
            <label>
              Choose a file
              <input
                required
                name="file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt"
              />
            </label>
            <button className="btn" disabled={uploading}>
              {uploading ? "Uploading…" : "Upload document"}
            </button>
          </form>

          {detail.evidence.length > 0 && (
            <div className="evidence-list">
              {detail.evidence.map((item) => (
                <div className="evidence-item" key={String(item.id)}>
                  <div>
                    <strong>{String(item.title)}</strong>
                    <small>Added {dayAndClock(item.uploaded_at)}</small>
                  </div>
                  <a
                    className="rowlink"
                    href={`/api/evidence/${String(item.id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="footer-note">
          This is an independent prototype built for Build What Moves India. It
          does not file complaints, contact banks or police, freeze money, or
          register an FIR.
        </p>
      </main>
    </>
  );
}

"use client";

import { useState } from "react";
import { DemoEntry } from "./DemoEntry";
import { AiAnalysis } from "./AiAnalysis";
import {
  emptyReportDetails,
  reportDetailsSchema,
  reportDetailFields,
  reportNarrative,
  type ReportDetails,
} from "@/lib/report-details";
import {
  ReportDetailsFields,
  type ReportAttachment,
} from "./ReportDetailsFields";

type IntakePreview = {
  amount: number;
  structured: {
    fraudType: string;
    mechanism: string;
    paymentChannel: string;
    impersonatedEntity: string | null;
    confidence: number;
    summary: string;
  };
};

const defaultDescription =
  "Synthetic demo: someone claiming to be from a bank said my KYC was expiring. They asked me to install an APK sent on WhatsApp and ₹48,500 was transferred. I discovered the loss on my demo statement and retained screenshots of the messages and the payment receipt.";

export function ReportClient({ localDemo = false }: { localDemo?: boolean }) {
  const [description, setDescription] = useState(
    localDemo ? defaultDescription : "",
  );
  const [amount, setAmount] = useState(localDemo ? "48500" : "");
  const [fraudType, setFraudType] = useState("Other financial cyber fraud");
  const [paymentChannel, setPaymentChannel] = useState("Bank transfer");
  const [incidentAt, setIncidentAt] = useState(() =>
    localDemo ? new Date().toISOString().slice(0, 16) : "",
  );
  const [transactionReference, setTransactionReference] = useState(
    localDemo ? "SIM-TXN-48500" : "",
  );
  const [institutionDetails, setInstitutionDetails] = useState(
    localDemo ? "SBI account → beneficiary account (masked)" : "",
  );
  const [preview, setPreview] = useState<IntakePreview | null>(null);
  const [details, setDetails] = useState<ReportDetails>({
    ...emptyReportDetails,
  });
  const [attachments, setAttachments] = useState<ReportAttachment[]>([]);
  const [syntheticOnly, setSyntheticOnly] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<number[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"preview" | "create" | null>(null);

  async function understandCase(event: React.FormEvent) {
    event.preventDefault();
    if (reportNarrative(description, details).length > 5000) {
      setStatus(
        "Please shorten the report details to fit 5,000 characters in total.",
      );
      return;
    }
    if (!reportDetailsSchema.safeParse(details).success) {
      setStatus(
        "Check the location, bank, transaction date and optional email / website fields.",
      );
      return;
    }
    if (
      attachments.length > 5 ||
      attachments.filter((a) => a.title !== "Synthetic identity document")
        .length > 4 ||
      attachments.some((a) => !a.file.size || a.file.size > 4 * 1024 * 1024)
    ) {
      setStatus(
        "Choose at most four evidence files and one synthetic identity file. Each must be non-empty and no larger than 4 MB.",
      );
      return;
    }
    if (
      attachments.some((a) => a.title === "Synthetic identity document") &&
      details.identityType === "Not supplied"
    ) {
      setStatus("Choose the type of synthetic identity document you selected.");
      return;
    }
    setBusy("preview");
    setStatus("");
    try {
      const response = await fetch("/api/intake/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, amount: Number(amount) }),
      });
      const data = await response.json();
      setBusy(null);
      if (!response.ok) {
        setStatus(
          data.error ||
            "We could not understand this report. Please review the details.",
        );
        return;
      }
      setPreview(data);
    } catch {
      setStatus("Connection failed. Your fields are still here; please retry.");
    } finally {
      setBusy(null);
    }
  }

  async function createCase() {
    setBusy("create");
    setStatus("");
    try {
      let publicId = createdId;
      if (!publicId) {
        const response = await fetch("/api/intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description,
            details,
            syntheticOnly,
            amount: Number(amount),
            fraudType,
            paymentChannel,
            incidentAt: new Date(incidentAt).toISOString(),
            transactionReference: transactionReference || undefined,
            institutionDetails: institutionDetails || undefined,
          }),
        });
        const data = await response.json();
        if (response.status === 401 || data.error === "UNAUTHORIZED") {
          setStatus("Enter the citizen demo first to create a case.");
          return;
        }
        if (!response.ok) {
          setStatus(
            data.error ||
              "We could not create this case. Please review the details.",
          );
          return;
        }
        publicId = String(data.publicId);
        setCreatedId(publicId);
      }
      for (const [index, attachment] of attachments.entries()) {
        if (uploaded.includes(index)) continue;
        const form = new FormData();
        form.set("caseId", publicId);
        form.set("title", attachment.title);
        form.set("file", attachment.file);
        const response = await fetch("/api/evidence", {
          method: "POST",
          body: form,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            `Case ${publicId} was created, but ${attachment.file.name} could not upload: ${data.error || "please retry"}. Retry uploads below; this will not create another case.`,
          );
        setUploaded((previous) => [...previous, index]);
      }
      location.href = `/case/${publicId}`;
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Connection failed. Please retry.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (preview) {
    const { structured } = preview;
    return (
      <section className="form" aria-labelledby="review-heading">
        <div>
          <span className="eyebrow">Step 2 of 2 · Review</span>
          <h2 id="review-heading">We understood</h2>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            {structured.summary}
          </p>
        </div>
        <dl className="intake-review-grid">
          <div>
            <dt>Reported type</dt>
            <dd>{fraudType}</dd>
          </div>
          <div>
            <dt>Mechanism</dt>
            <dd>{structured.mechanism}</dd>
          </div>
          <div>
            <dt>Payment channel</dt>
            <dd>{paymentChannel}</dd>
          </div>
          <div>
            <dt>Reported institution</dt>
            <dd>
              {institutionDetails ||
                structured.impersonatedEntity ||
                "Not identified"}
            </dd>
          </div>
          <div>
            <dt>Incident time</dt>
            <dd>{new Date(incidentAt).toLocaleString("en-IN")}</dd>
          </div>
          <div>
            <dt>Transaction reference</dt>
            <dd>{transactionReference || "Not provided"}</dd>
          </div>
          <div>
            <dt>Amount</dt>
            <dd>₹{preview.amount.toLocaleString("en-IN")}</dd>
          </div>
        </dl>
        <h3>Additional report details</h3>
        <dl className="intake-review-grid">
          {reportDetailFields.map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{details[key] || "Not known"}</dd>
            </div>
          ))}
          <div>
            <dt>Identity document</dt>
            <dd>{details.identityType}</dd>
          </div>
          <div>
            <dt>Evidence notes</dt>
            <dd>{details.evidenceNotes || "Not supplied"}</dd>
          </div>
        </dl>
        <p>{attachments.length} document(s) will upload after case creation.</p>
        <ul>
          {attachments.map((a, i) => (
            <li key={i}>
              {a.file.name}
              {uploaded.includes(i) ? " — uploaded" : " — pending"}
            </li>
          ))}
        </ul>
        <p className="footer-note review-note">
          This is our reading of your report, not a legal finding. Correct
          anything that is wrong before you create the case.
        </p>
        {status && (
          <div className="error" role="status">
            {status}
          </div>
        )}
        <div className="action-row">
          <button
            className="btn secondary"
            type="button"
            onClick={() => setPreview(null)}
            disabled={busy !== null || Boolean(createdId)}
          >
            Back to report
          </button>
          <button
            className="btn"
            type="button"
            onClick={createCase}
            disabled={busy !== null}
          >
            {busy === "create"
              ? "Saving case and documents…"
              : createdId
                ? "Retry pending uploads"
                : "Confirm and create case"}
          </button>
          {createdId && (
            <a className="btn secondary" href={`/case/${createdId}`}>
              Open created case (upload remaining documents there)
            </a>
          )}
          {localDemo ? (
            <DemoEntry
              role="citizen"
              label="Enter citizen demo first"
              variant="secondary"
            />
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <form
      className="form report-easy"
      onSubmit={understandCase}
      onInvalidCapture={(event) => {
        const element = event.target as HTMLElement;
        const group = element.closest("details");
        if (group) group.open = true;
      }}
    >
      <div className="report-intro">
        <span className="eyebrow">Tell us · Review · Create case</span>
        <h2>You don’t need to know every detail.</h2>
        <p>
          Start with what you remember. That becomes one case. You’ll review
          everything before it is created.
        </p>
      </div>
      <h3>1 · Tell your story</h3>
      <label>
        What happened?
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          required
          minLength={200}
          maxLength={3000}
          aria-describedby="description-help"
          rows={7}
          placeholder="How were you contacted? What did they ask you to do? What happened next, and when did you notice the loss? Write in your own words."
        />
      </label>
      <p id="description-help" className="footer-note">
        {description.length}/3,000 characters · minimum 200. Describe how you
        were contacted, what was requested, the sequence of events and how you
        discovered the loss. Do not include passwords or OTPs.
      </p>
      <label>
        How much money did you lose? (₹)
        <input
          type="number"
          min="1"
          max="10000000"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </label>
      <details className="report-optional">
        <summary>
          Choose a fraud category{" "}
          <span>Optional · use AI help below if unsure</span>
        </summary>
        <label>
          Fraud category
          <select
            value={fraudType}
            onChange={(event) => setFraudType(event.target.value)}
            required
          >
            <option>Bank impersonation / phishing</option>
            <option>Investment scam</option>
            <option>Marketplace fraud</option>
            <option>OTP / account takeover</option>
            <option>Other financial cyber fraud</option>
          </select>
        </label>
      </details>
      <label>
        Payment channel
        <select
          value={paymentChannel}
          onChange={(event) => setPaymentChannel(event.target.value)}
          required
        >
          <option>Bank transfer</option>
          <option>UPI</option>
          <option>Card</option>
          <option>Wallet</option>
          <option>Other digital payment</option>
        </select>
      </label>
      <label>
        When did it happen?
        <input
          type="datetime-local"
          value={incidentAt}
          onChange={(event) => setIncidentAt(event.target.value)}
          required
        />
      </label>
      <details className="report-optional">
        <summary>
          Add a payment reference or account details{" "}
          <span>Optional · if you have your receipt</span>
        </summary>
        <div className="form">
          <label>
            Transaction reference (optional)
            <input
              value={transactionReference}
              onChange={(event) => setTransactionReference(event.target.value)}
              maxLength={120}
            />
          </label>
          <label>
            Institution or masked account details (optional)
            <input
              value={institutionDetails}
              onChange={(event) => setInstitutionDetails(event.target.value)}
              maxLength={160}
            />
          </label>
        </div>
      </details>
      <ReportDetailsFields
        details={details}
        onChange={setDetails}
        attachments={attachments}
        onFiles={setAttachments}
        syntheticOnly={syntheticOnly}
        onSynthetic={setSyntheticOnly}
        incidentDate={incidentAt.slice(0, 10)}
      />
      <h3>3 · Check before you continue</h3>
      <p className="footer-note">
        AI help is optional. It can pull details from your story for you to
        review. You can also go straight to Continue.
      </p>
      <AiAnalysis
        description={description}
        onAccept={(result) => {
          setFraudType(result.fraudType);
          if (result.reportedAmount !== null)
            setAmount(String(result.reportedAmount));
          if (result.paymentChannel) setPaymentChannel(result.paymentChannel);
          if (result.transactionReferences.length)
            setTransactionReference(result.transactionReferences[0]);
          // A source/impersonated institution must never become a beneficiary.
          if (result.beneficiaryInstitution)
            setInstitutionDetails(result.beneficiaryInstitution);
          if (result.incidentDate && result.incidentTime)
            setIncidentAt(`${result.incidentDate}T${result.incidentTime}`);
          setStatus(
            "Suggestions copied. Review and correct the fields above before continuing. Dates and institutions that are unknown must be supplied by you.",
          );
        }}
      />
      {status && (
        <div className="error" role="status">
          {status}
        </div>
      )}
      <div className="action-row">
        <button className="btn" disabled={busy !== null}>
          {busy === "preview" ? "Reading your report…" : "Continue"}
        </button>
        {localDemo ? (
          <DemoEntry
            role="citizen"
            label="Enter citizen demo first"
            variant="secondary"
          />
        ) : null}
      </div>
      <p className="footer-note review-note">
        Nothing is sent to a bank or a police station. This prototype creates a
        demonstration case only.
      </p>
    </form>
  );
}

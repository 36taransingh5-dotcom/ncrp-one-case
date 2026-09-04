"use client";

import { useState } from "react";
import { DemoEntry } from "./DemoEntry";

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
  "Someone claiming to be from SBI said my KYC was expiring. They asked me to install an APK sent on WhatsApp and ₹48,500 was transferred.";

export function ReportClient({ localDemo = false }: { localDemo?: boolean }) {
  const [description, setDescription] = useState(defaultDescription);
  const [amount, setAmount] = useState("48500");
  const [fraudType, setFraudType] = useState("Bank impersonation / phishing");
  const [paymentChannel, setPaymentChannel] = useState("Bank transfer");
  const [incidentAt, setIncidentAt] = useState(() =>
    new Date().toISOString().slice(0, 16),
  );
  const [transactionReference, setTransactionReference] =
    useState("SIM-TXN-48500");
  const [institutionDetails, setInstitutionDetails] = useState(
    "SBI account → beneficiary account (masked)",
  );
  const [preview, setPreview] = useState<IntakePreview | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"preview" | "create" | null>(null);

  async function understandCase(event: React.FormEvent) {
    event.preventDefault();
    setBusy("preview");
    setStatus("");
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
  }

  async function createCase() {
    setBusy("create");
    setStatus("");
    const response = await fetch("/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        amount: Number(amount),
        fraudType,
        paymentChannel,
        incidentAt: new Date(incidentAt).toISOString(),
        transactionReference: transactionReference || undefined,
        institutionDetails: institutionDetails || undefined,
      }),
    });
    const data = await response.json();
    setBusy(null);
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
    location.href = `/case/${data.publicId}`;
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
            disabled={busy !== null}
          >
            Back to report
          </button>
          <button
            className="btn"
            type="button"
            onClick={createCase}
            disabled={busy !== null}
          >
            {busy === "create" ? "Creating case…" : "Confirm and create case"}
          </button>
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
    <form className="form" onSubmit={understandCase}>
      <span className="eyebrow">Step 1 of 2 · Describe</span>
      <label>
        What happened?
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          required
          minLength={30}
          rows={7}
        />
      </label>
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

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

export function ReportClient() {
  const [description, setDescription] = useState(defaultDescription);
  const [amount, setAmount] = useState("48500");
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
      body: JSON.stringify({ description, amount: Number(amount) }),
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
            <dt>Fraud type</dt>
            <dd>{structured.fraudType}</dd>
          </div>
          <div>
            <dt>Mechanism</dt>
            <dd>{structured.mechanism}</dd>
          </div>
          <div>
            <dt>Payment channel</dt>
            <dd>{structured.paymentChannel}</dd>
          </div>
          <div>
            <dt>Impersonated institution</dt>
            <dd>{structured.impersonatedEntity || "Not identified"}</dd>
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
          <DemoEntry
            role="citizen"
            label="Enter citizen demo first"
            variant="secondary"
          />
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
      {status && (
        <div className="error" role="status">
          {status}
        </div>
      )}
      <div className="action-row">
        <button className="btn" disabled={busy !== null}>
          {busy === "preview" ? "Reading your report…" : "Continue"}
        </button>
        <DemoEntry
          role="citizen"
          label="Enter citizen demo first"
          variant="secondary"
        />
      </div>
      <p className="footer-note review-note">
        Nothing is sent to a bank or a police station. This prototype creates a
        demonstration case only.
      </p>
    </form>
  );
}

"use client";
import { useState } from "react";
import { intelligenceSchema, type Intelligence } from "@/lib/ai/schema";

export function AiAnalysis({
  description,
  caseId,
  onAccept,
  onResult,
}: {
  description?: string;
  caseId?: string;
  onAccept?: (result: Intelligence) => void;
  onResult?: (result: Intelligence) => void;
}) {
  const [result, setResult] = useState<Intelligence | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [analysedInput, setAnalysedInput] = useState("");
  const input = caseId || description || "";
  const current = analysedInput === input ? result : null;
  async function analyse() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        caseId ? "/api/ai/case-brief" : "/api/ai/analyse-complaint",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(caseId ? { caseId } : { description }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "AI analysis unavailable. Continue normally.",
        );
      const parsed = intelligenceSchema.parse(data.result);
      setResult(parsed);
      setAnalysedInput(input);
      onResult?.(parsed);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "AI analysis unavailable. Continue normally.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="card section"
      aria-label={caseId ? "AI Case Brief" : "AI report analysis"}
    >
      <h2>{caseId ? "AI Case Brief" : "Understand your report with AI"}</h2>
      <p>
        OpenAI analyses {caseId ? "relevant case details" : "your description"}{" "}
        to suggest information and next steps. Operational decisions remain with
        authorised users.
      </p>
      <button
        type="button"
        className="btn secondary"
        onClick={analyse}
        disabled={busy || Boolean(current)}
      >
        {busy
          ? "Analysing…"
          : caseId
            ? "Generate case brief"
            : "Analyse report"}
      </button>
      {error && (
        <p role="status" className="error">
          {error}
        </p>
      )}
      {current && (
        <div aria-live="polite">
          <p>{current.summary}</p>
          <dl>
            <dt>Suggested category</dt>
            <dd>{current.fraudType}</dd>
            <dt>Amount</dt>
            <dd>
              {current.reportedAmount === null
                ? "Unknown"
                : `₹${current.reportedAmount.toLocaleString("en-IN")}`}
            </dd>
            <dt>Payment channel</dt>
            <dd>{current.paymentChannel || "Unknown"}</dd>
            <dt>Source institution</dt>
            <dd>{current.sourceInstitution || "Unknown"}</dd>
            <dt>Beneficiary institution</dt>
            <dd>{current.beneficiaryInstitution || "Unknown"}</dd>
            <dt>Evidence mentioned</dt>
            <dd>{current.evidenceMentioned.join(", ") || "None stated"}</dd>
          </dl>
          {(
            [
              ["Stated in supplied information", current.known],
              ["Inferred — please verify", current.inferred],
              ["Still needed", current.missingInformation],
            ] as const
          ).map(([title, items]) => (
            <div key={title}>
              <strong>{title}</strong>
              <ul>
                {items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
          <strong>
            Suggested by AI:{" "}
            {current.recommendedAction.replaceAll("_", " ").toLowerCase()}
          </strong>
          <p>{current.reason}</p>
          <p>
            AI analysis only — review required. No operational action has been
            taken.
          </p>
          {onAccept && (
            <div className="action-row">
              <button
                type="button"
                className="btn secondary"
                onClick={() => onAccept(current)}
              >
                Use suggestions in editable fields
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setResult(null);
                  setAnalysedInput("");
                }}
              >
                Ignore suggestions
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

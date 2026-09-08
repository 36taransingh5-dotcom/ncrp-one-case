"use client";

import { useEffect, useState } from "react";
import { DigiLockerComingSoonButton } from "@/components/DigiLockerComingSoon";

type IssuedFile = {
  name: string;
  uri: string;
  description: string;
  issuer: string;
};

export function DigiLockerConnect({
  enabled = false,
  caseId,
  status = "",
}: {
  enabled?: boolean;
  caseId: string;
  status?: string;
}) {
  const [files, setFiles] = useState<IssuedFile[] | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const connected = status === "connected";

  useEffect(() => {
    if (!enabled || !connected) return;
    let cancelled = false;
    fetch(
      `/api/integrations/digilocker/files?caseId=${encodeURIComponent(caseId)}`,
    )
      .then(async (response) => {
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setMessage(body.error || "DigiLocker documents could not be listed.");
          return;
        }
        setFiles(body.items || []);
      })
      .catch(() => {
        if (!cancelled) setMessage("DigiLocker documents could not be listed.");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, connected, caseId]);

  async function importFile(item: IssuedFile) {
    setBusy(item.uri);
    setMessage("");
    try {
      const response = await fetch("/api/integrations/digilocker/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          uri: item.uri,
          name: item.name,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Import failed.");
      setMessage(`${item.name} was attached to this case.`);
      location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "That document could not be imported.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="label">DigiLocker</div>
      <strong>
        {enabled
          ? connected
            ? "Select a document to attach"
            : "Requester access is configured"
          : "Not connected"}
      </strong>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0 12px" }}>
        {enabled
          ? "You authorize DigiLocker, then choose one issued document. Unrelated documents are never imported automatically."
          : "Requires DigiLocker requester onboarding. This prototype will not invent a fake locker or pull documents without approved credentials."}
      </p>
      {status === "denied" && (
        <p style={{ fontSize: 13 }}>DigiLocker authorization was cancelled.</p>
      )}
      {status === "error" && (
        <p style={{ fontSize: 13 }}>
          DigiLocker authorization failed. Requester credentials and redirect
          URI must match the partner portal.
        </p>
      )}
      {enabled && !connected && (
        <a
          className="btn secondary"
          href={`/api/integrations/digilocker/start?caseId=${encodeURIComponent(caseId)}`}
        >
          Connect DigiLocker
        </a>
      )}
      {!enabled && <DigiLockerComingSoonButton label="Connect DigiLocker" />}
      {files && files.length === 0 && (
        <p style={{ fontSize: 13, marginTop: 12 }}>
          No issued documents were shared for this authorization.
        </p>
      )}
      {files && files.length > 0 && (
        <div className="request-list" style={{ marginTop: 12 }}>
          {files.map((item) => (
            <div className="request" key={item.uri}>
              <div>
                <strong>{item.name}</strong>
                <p>
                  {[item.description, item.issuer]
                    .filter(Boolean)
                    .join(" · ") || "Issued document"}
                </p>
              </div>
              <button
                className="btn secondary"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => importFile(item)}
              >
                {busy === item.uri ? "Attaching…" : "Attach to case"}
              </button>
            </div>
          ))}
        </div>
      )}
      {message && <p style={{ fontSize: 13, marginTop: 12 }}>{message}</p>}
    </div>
  );
}

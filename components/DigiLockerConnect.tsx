export function DigiLockerConnect({ enabled = false }: { enabled?: boolean }) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="label">DigiLocker</div>
      <strong>
        {enabled ? "Requester access is configured" : "Not connected"}
      </strong>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0 12px" }}>
        {enabled
          ? "Choose a document after you authorize DigiLocker. Unrelated documents are never imported automatically."
          : "Requires DigiLocker requester onboarding. This prototype will not invent a fake locker or pull documents without approved credentials."}
      </p>
      <button className="btn secondary" type="button" disabled>
        {enabled ? "Connect DigiLocker" : "Connect DigiLocker (unavailable)"}
      </button>
    </div>
  );
}

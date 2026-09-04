export default function EmptyOperationsQueue() {
  return (
    <>
      <div className="notice">
        Operations · Independent hackathon prototype. External integrations are
        simulated.
      </div>
      <main className="shell" style={{ maxWidth: 720, paddingTop: 48 }}>
        <section className="card section">
          <div className="eyebrow">My Queue</div>
          <h1>No cases are waiting</h1>
          <p>
            New citizen reports and assigned cases will appear here. The queue
            is backed by persisted PostgreSQL case and assignment records.
          </p>
          <a className="btn secondary" href="/">
            Return home
          </a>
        </section>
      </main>
    </>
  );
}

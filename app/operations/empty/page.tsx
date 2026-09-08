import { PrototypeNotice } from "@/components/PrototypeNotice";

export default function EmptyOperationsQueue() {
  return (
    <>
      <PrototypeNotice />
      <main className="shell" style={{ maxWidth: 720, paddingTop: 48 }}>
        <section className="card section">
          <div className="eyebrow">My Queue</div>
          <h1>No cases are waiting</h1>
          <p>New citizen reports and assigned cases will appear here.</p>
          <a className="btn secondary" href="/">
            Return home
          </a>
        </section>
      </main>
    </>
  );
}

import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { listCitizenCases } from "@/lib/repository";

const rupee = (value: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export const dynamic = "force-dynamic";

export default async function CitizenCasesPage() {
  const session = await currentSession();
  if (!session) redirect("/auth");
  if (session.role === "operator") redirect("/operations");
  const cases = await listCitizenCases(session.userId);
  return (
    <>
      <div className="notice">
        Independent hackathon prototype — external government, police and
        banking actions are simulated.
      </div>
      <header className="dash-head">
        <div className="shell case-title">
          <div>
            <div className="eyebrow">Citizen account</div>
            <h1>Your cases</h1>
            <p>Signed in as {session.displayName}</p>
          </div>
          <div className="case-actions">
            <a className="btn" href="/report">
              Report a new incident
            </a>
            <form action="/auth/signout" method="post">
              <button className="btn secondary">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="shell" style={{ paddingTop: 28, paddingBottom: 56 }}>
        {cases.length ? (
          <div className="citizen-case-list">
            {cases.map((item) => (
              <a
                className="card citizen-case-row"
                href={`/case/${String(item.public_case_id)}`}
                key={String(item.id)}
              >
                <div>
                  <span className="label">{String(item.public_case_id)}</span>
                  <h2>{String(item.fraud_type)}</h2>
                  <p>{String(item.current_owner_name)}</p>
                </div>
                <div>
                  <strong>{rupee(item.reported_amount)}</strong>
                  <span className="badge">{String(item.current_stage)}</span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <section className="card section">
            <div className="empty">
              <strong>No cases yet.</strong>
              <p>
                When you report an incident, your persistent case and all
                subsequent updates will appear here.
              </p>
              <a className="btn" href="/report">
                Report financial fraud
              </a>
            </div>
          </section>
        )}
      </main>
    </>
  );
}

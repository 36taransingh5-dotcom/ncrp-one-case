import { PrototypeNotice } from "@/components/PrototypeNotice";
import { currentSession } from "@/lib/auth";
import { getIntegrationStatusRows } from "@/lib/adapters/status";
import { connection } from "next/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const tone: Record<string, string> = {
  LIVE: "stat-green",
  SANDBOX: "stat-amber",
  SIMULATED: "",
  "NOT CONNECTED": "stat-red",
  "NOT CONFIGURED": "stat-red",
  DEGRADED: "stat-red",
};

export default async function IntegrationsPage() {
  await connection();
  const session = await currentSession();
  if (!session || session.role !== "operator") redirect("/auth");
  const rows = getIntegrationStatusRows();
  return (
    <>
      <PrototypeNotice />
      <header className="dash-head">
        <div className="shell case-title">
          <div>
            <div className="crumb">
              <a href="/operations">Operations</a> · signed in as{" "}
              {session.displayName}
            </div>
            <h1>Partner connections</h1>
            <p>
              Check which banks, police systems and email providers are actually
              connected. Live is reserved for production providers. Bank, police
              and reporting HTTP bindings stay sandbox unless a live
              institutional API is connected.
            </p>
          </div>
          <a className="btn secondary" href="/operations">
            Back to queue
          </a>
        </div>
      </header>
      <main className="shell" style={{ paddingTop: 28, paddingBottom: 56 }}>
        <section className="card section">
          <div className="label">Current bindings</div>
          <div className="integration-status-list">
            {rows.map((row) => (
              <div className="integration-status-row" key={row.name}>
                <div>
                  <strong>{row.name}</strong>
                  <p>{row.detail}</p>
                </div>
                <span className={`badge ${tone[row.status] || ""}`}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

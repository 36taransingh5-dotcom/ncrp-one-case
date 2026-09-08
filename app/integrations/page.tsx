import { PrototypeNotice } from "@/components/PrototypeNotice";
import { currentSession } from "@/lib/auth";
import { getIntegrationStatusRows } from "@/lib/adapters/status";
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
            <h1>Integration status</h1>
            <p>
              Live labels are reserved for configured production providers.
              Bank, police and reporting HTTP bindings are sandbox unless a live
              institutional API is actually connected.
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

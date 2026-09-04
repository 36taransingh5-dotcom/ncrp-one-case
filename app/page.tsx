import { DemoEntry } from "@/components/DemoEntry";
import { currentSession } from "@/lib/auth";
import { isLocalBackend } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

const steps = [
  {
    title: "Report once",
    body: "Describe what happened in your own words. That becomes one case, not a form you repeat at every counter.",
  },
  {
    title: "The money is chased first",
    body: "Banks are asked to hold what can still be held, and every rupee is tracked as secured, being traced, or gone.",
  },
  {
    title: "Agencies hand over, not you",
    body: "Cyber cells, police and banks pick the case up from each other. You always see who owns the next action.",
  },
];

export default async function Home() {
  const session = await currentSession();
  const local = isLocalBackend();
  const accountHref = session
    ? session.role === "operator"
      ? "/operations"
      : "/cases"
    : "/auth";
  return (
    <>
      <div className="notice">
        Independent hackathon prototype — not an official government service.
        All identities, institutions, transactions and external actions are
        synthetic or simulated.
      </div>
      <main className="shell">
        <nav className="nav">
          <div className="brand">
            NCRP <span>One Case</span>
          </div>
          <div className="navlinks">
            <a href="#how">How it works</a>
            <a className="btn secondary" href={accountHref}>
              {session ? "Open account" : "Sign in"}
            </a>
            {local ? (
              <DemoEntry role="operator" label="Enter operations demo" />
            ) : null}
          </div>
        </nav>

        <section className="hero">
          <div>
            <span className="eyebrow">
              Report once. Government coordinates the rest.
            </span>
            <h1>You report cyber fraud once. The system does the running.</h1>
            <p>
              Today a victim repeats their story to a portal, a bank and a
              police station, and never learns where the money went. One Case
              replaces that with a single case that tracks the money, the
              agencies and the next action — in the open.
            </p>
            <div className="hero-actions">
              <a
                className="btn"
                href={session?.role === "citizen" ? "/report" : "/auth"}
              >
                Start a new report
              </a>
              {local ? (
                <DemoEntry role="citizen" label="Enter citizen demo" />
              ) : null}
              {local ? (
                <DemoEntry role="operator" label="Enter operations demo" />
              ) : null}
            </div>
            <p className="hero-hint">
              {local
                ? "Synthetic demos open instantly; the production path uses real accounts."
                : "Secure email sign-in keeps every citizen case private."}
            </p>
          </div>

          <div
            className="card hero-card"
            aria-label="Synthetic example case summary"
          >
            <span className="label">A synthetic case in progress</span>
            <h2>NCRP-26-847193</h2>
            <div className="hero-amount">
              <span className="label">Reported stolen</span>
              <strong>₹48,500</strong>
            </div>
            <div className="hero-bar" aria-hidden>
              <span className="secured" style={{ width: "64.3%" }} />
              <span className="tracing" style={{ width: "24.7%" }} />
              <span className="unrecovered" style={{ width: "11%" }} />
            </div>
            <dl className="hero-split">
              <div>
                <dt>Secured</dt>
                <dd className="stat-green">₹31,200</dd>
              </div>
              <div>
                <dt>Being traced</dt>
                <dd className="stat-amber">₹12,000</dd>
              </div>
              <div>
                <dt>Unrecovered</dt>
                <dd className="stat-red">₹5,300</dd>
              </div>
            </dl>
            <p className="hero-owner">
              <strong>Waiting for HDFC Bank</strong>
              Nothing needed from the citizen right now.
            </p>
          </div>
        </section>

        <section id="how" className="card section how-section">
          <span className="eyebrow">How One Case works</span>
          <h2>
            Coordination is the government&rsquo;s job, not the victim&rsquo;s.
          </h2>
          <div className="how-grid">
            {steps.map((step, index) => (
              <div className="how-step" key={step.title}>
                <span className="how-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="footer-note">
          Built for Build What Moves India. This prototype does not file
          complaints, contact banks or police, freeze money, or register an FIR.
          Bank, police and reporting integrations are simulated behind
          replaceable interfaces.
        </p>
      </main>
    </>
  );
}

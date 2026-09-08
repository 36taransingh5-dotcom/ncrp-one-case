import { DemoEntry } from "@/components/DemoEntry";
import { DigiLockerComingSoonButton } from "@/components/DigiLockerComingSoon";
import { BrandMark } from "@/components/BrandMark";
import { PrototypeNotice } from "@/components/PrototypeNotice";
import { SiteNav } from "@/components/SiteNav";
import { currentSession } from "@/lib/auth";
import { isDemoAccessEnabled } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

const steps = [
  {
    title: "Report once",
    body: "Describe what happened in your own words. You do not repeat this at a bank or a police station.",
  },
  {
    title: "One case is created",
    body: "That report becomes one case that banks, police and the citizen all work from.",
  },
  {
    title: "AI structures the report",
    body: "AI organises the facts so the money can be chased immediately. You can still correct anything.",
  },
  {
    title: "Banks, police and evidence stay coordinated",
    body: "Each task has an owner. The next action is visible instead of being chased across counters.",
  },
  {
    title: "The money is traced",
    body: "Every rupee is shown as secured, still being traced, or gone — including when it moves to another account.",
  },
  {
    title: "The citizen sees everything here",
    body: "Protected amount, current status, what to do next, and FIR status stay on one page.",
  },
];

export default async function Home() {
  const session = await currentSession();
  const demoAccess = isDemoAccessEnabled();
  const accountHref = session
    ? session.role === "operator"
      ? "/operations"
      : "/cases"
    : "/auth";
  return (
    <>
      <PrototypeNotice />
      <main className="shell">
        <SiteNav
          links={[
            { href: "#how", label: "How it works" },
            { href: accountHref, label: session ? "Open account" : "Sign in" },
          ]}
          extra={
            demoAccess ? (
              <DemoEntry role="operator" label="Enter operations demo" />
            ) : null
          }
        />

        <section className="hero hero-centered">
          <span className="hero-mark">
            <BrandMark size={72} />
          </span>
          <h1>
            You report cyber fraud <span className="accent">once</span>. The
            system does the <span className="accent">running</span>.
          </h1>
          <p>
            Today a victim repeats their story to a portal, a bank and a police
            station, and never learns where the money went. One Case replaces
            that with a single case that tracks the money, the agencies and the
            next action — in the open.
          </p>
          <div className="hero-actions">
            <a
              className="btn"
              href={session?.role === "citizen" ? "/report" : "/auth"}
            >
              Start a new report
            </a>
            {!session ? <DigiLockerComingSoonButton /> : null}
            {demoAccess ? (
              <DemoEntry role="citizen" label="Enter citizen demo" />
            ) : null}
            {demoAccess ? (
              <DemoEntry role="operator" label="Enter operations demo" />
            ) : null}
          </div>
          <p className="hero-hint">
            {demoAccess
              ? "Synthetic demos open instantly; citizen accounts can also use secure email sign-in."
              : "Secure email sign-in keeps every citizen case private."}
          </p>
        </section>

        <div className="hero-case-wrap">
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
        </div>

        <a className="landing-path" href="#how">
          Report once → One case → Money traced · See ↓
        </a>

        <section id="how" className="card section how-section">
          <span className="eyebrow">How One Case works</span>
          <h2>One report. One case. Everyone works from the same picture.</h2>
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
          Built for Build What Moves India. Official NCRP, bank and police
          systems are not connected. Adapters may be live, sandbox or simulated
          — check operator integration status for the current binding.
        </p>
      </main>
    </>
  );
}

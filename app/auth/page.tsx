import { AuthForm } from "@/components/AuthForm";
import { DemoEntry } from "@/components/DemoEntry";
import {
  isDemoAccessEnabled,
  isLocalBackend,
  isShowcaseDemoConfigured,
  isSupabaseConfigured,
} from "@/lib/supabase/config";

export default function AuthPage() {
  const local = isLocalBackend();
  const demoAccess = isDemoAccessEnabled();
  const showcaseDemo = isShowcaseDemoConfigured();
  return (
    <>
      <div className="notice">
        Independent hackathon prototype — not an official government service.
      </div>
      <main className="shell" style={{ maxWidth: 620, paddingTop: 48 }}>
        <a className="crumb" href="/">
          ← NCRP One Case
        </a>
        <section className="card section" style={{ marginTop: 18 }}>
          <div className="eyebrow">Secure citizen access</div>
          <h1>Create or access your account</h1>
          <p>
            We’ll email you a secure sign-in link. New accounts are always
            created as citizens; operator access is assigned separately by an
            administrator.
          </p>
          <AuthForm configured={!local && isSupabaseConfigured()} />
          {demoAccess ? (
            <>
              <div className="auth-divider">
                <span>Judging the synthetic demo?</span>
              </div>
              <div className="demo-entry-stack">
                {showcaseDemo ? (
                  <div className="demo-entry-option featured">
                    <div>
                      <strong>Mentor showcase</strong>
                      <p>
                        Open a presentation-ready citizen account after a
                        report, with the money trail, evidence, handoffs and FIR
                        progress already populated.
                      </p>
                    </div>
                    <DemoEntry
                      role="citizen"
                      demo="showcase"
                      label="Enter showcase citizen"
                    />
                  </div>
                ) : null}
                <div className="demo-entry-option">
                  <div>
                    <strong>Live operator-action demo</strong>
                    <p>
                      Open the seeded case that updates in real time when the
                      operator secures another ₹6,700.
                    </p>
                  </div>
                  <DemoEntry
                    role="citizen"
                    label="Enter golden-path citizen"
                    variant={showcaseDemo ? "secondary" : "primary"}
                  />
                </div>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </>
  );
}

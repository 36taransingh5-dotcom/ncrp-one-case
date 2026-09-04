import { AuthForm } from "@/components/AuthForm";
import { DemoEntry } from "@/components/DemoEntry";
import {
  isDemoAccessEnabled,
  isLocalBackend,
  isSupabaseConfigured,
} from "@/lib/supabase/config";

export default function AuthPage() {
  const local = isLocalBackend();
  const demoAccess = isDemoAccessEnabled();
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
              <DemoEntry role="citizen" label="Enter synthetic citizen demo" />
            </>
          ) : null}
        </section>
      </main>
    </>
  );
}

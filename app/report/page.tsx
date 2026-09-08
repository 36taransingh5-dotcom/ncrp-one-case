import { ReportClient } from "@/components/ReportClient";
import { PrototypeNotice } from "@/components/PrototypeNotice";
import { isLocalBackend } from "@/lib/supabase/config";

export default function ReportPage() {
  return (
    <>
      <PrototypeNotice extra="This form does not file an official complaint." />
      <main className="shell report-shell">
        <a className="crumb" href="/">
          ← NCRP One Case
        </a>
        <div className="card section report-card">
          <span className="eyebrow">Report financial cyber fraud</span>
          <h1>Tell us what happened.</h1>
          <p className="report-intro">
            Write it the way you would tell a person. You do not need reference
            numbers, section codes or the name of the right department — we work
            those out and show you what we understood before anything is filed.
          </p>
          <ReportClient localDemo={isLocalBackend()} />
        </div>
      </main>
    </>
  );
}

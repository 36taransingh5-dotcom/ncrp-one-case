"use client";
import { reportDetailFields, type ReportDetails } from "@/lib/report-details";

export type ReportAttachment = { file: File; title: string };

export function ReportDetailsFields({
  details,
  onChange,
  attachments,
  onFiles,
  syntheticOnly,
  onSynthetic,
}: {
  details: ReportDetails;
  onChange: (details: ReportDetails) => void;
  attachments: ReportAttachment[];
  onFiles: (files: ReportAttachment[]) => void;
  syntheticOnly: boolean;
  onSynthetic: (value: boolean) => void;
}) {
  function field(
    key: (typeof reportDetailFields)[number][0],
    label: string,
    max: number,
  ) {
    return (
      <label key={key}>
        {label}
        <input
          type={
            key === "transactionDate"
              ? "date"
              : key === "suspectEmail"
                ? "email"
                : key === "suspectWebsite"
                  ? "url"
                  : "text"
          }
          value={details[key]}
          maxLength={max}
          required={["location", "bank", "transactionDate"].includes(key)}
          onChange={(e) => onChange({ ...details, [key]: e.target.value })}
        />
      </label>
    );
  }
  return (
    <>
      <fieldset className="form">
        <legend>Incident location and transaction details</legend>
        {reportDetailFields
          .slice(0, 3)
          .map(([key, label, max]) => field(key, label, max))}
        <p className="footer-note">
          Use the date on the payment receipt, which may differ from when the
          scam began. Enter “Unknown” for a bank you cannot identify.
        </p>
      </fieldset>
      <fieldset className="form">
        <legend>Suspect details — optional</legend>
        <p className="footer-note">
          Leave unknown details blank. These are citizen-reported leads, not
          verified identities. Use dummy or masked identifiers only.
        </p>
        {reportDetailFields
          .slice(3)
          .map(([key, label, max]) => field(key, label, max))}
      </fieldset>
      <fieldset className="form">
        <legend>Synthetic identity and evidence</legend>
        <p className="footer-note">
          Independent prototype: do not upload real identity documents, account
          numbers, passwords or OTPs. Documents are stored privately with
          SHA-256 checksums after confirmation. This does not file an official
          NCRP complaint.
        </p>
        <label>
          Identity document type
          <select
            value={details.identityType}
            onChange={(e) =>
              onChange({ ...details, identityType: e.target.value })
            }
          >
            {[
              "Not supplied",
              "Synthetic voter ID",
              "Synthetic driving licence",
              "Synthetic passport",
              "Synthetic PAN",
              "Synthetic Aadhaar",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Synthetic identity document (optional, JPG or PNG, up to 4 MB)
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => {
              const file = e.target.files?.[0];
              onFiles([
                ...attachments.filter(
                  (a) => a.title !== "Synthetic identity document",
                ),
                ...(file
                  ? [{ file, title: "Synthetic identity document" }]
                  : []),
              ]);
            }}
          />
        </label>
        <label>
          Supporting evidence / suspect photograph (optional, up to 4 files, 4
          MB each)
          <input
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,text/plain"
            onChange={(e) => {
              onFiles([
                ...attachments.filter(
                  (a) => a.title === "Synthetic identity document",
                ),
                ...Array.from(e.target.files || []).map((file) => ({
                  file,
                  title: `Synthetic evidence: ${file.name}`.slice(0, 120),
                })),
              ]);
            }}
          />
        </label>
        <p className="footer-note">
          PDF, JPG, PNG or text: payment receipts, chat screenshots, statements,
          suspect photograph or other supporting documents. Our demo uses a 4 MB
          upload limit.
        </p>
        {attachments.length > 0 && (
          <ul>
            {attachments.map((a, i) => (
              <li key={i}>
                {a.file.name} ({Math.ceil(a.file.size / 1024)} KB)
              </li>
            ))}
          </ul>
        )}
        <label>
          Evidence notes / why documents are unavailable (optional)
          <textarea
            rows={3}
            maxLength={400}
            value={details.evidenceNotes}
            onChange={(e) =>
              onChange({ ...details, evidenceNotes: e.target.value })
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            required
            checked={syntheticOnly}
            onChange={(e) => onSynthetic(e.target.checked)}
          />{" "}
          I confirm all information and documents are synthetic demo data, not
          real personal information.
        </label>
      </fieldset>
    </>
  );
}

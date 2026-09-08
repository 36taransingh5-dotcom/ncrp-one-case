import { z } from "zod";

export const reportDetailFields = [
  ["location", "Incident location / state", 160],
  ["bank", "Bank, wallet or merchant name", 120],
  ["transactionDate", "Date of transaction", 10],
  ["suspectName", "Suspect name (if known)", 120],
  ["suspectPhone", "Suspect phone (if known)", 40],
  ["suspectEmail", "Suspect email (if known)", 120],
  ["suspectAccount", "Suspect account / UPI ID (synthetic or masked)", 120],
  ["suspectAddress", "Suspect address (if known)", 200],
  ["suspectWebsite", "Suspected website URL (if known)", 200],
  ["suspectHandle", "Suspected social media handle (if known)", 120],
] as const;
export type ReportDetails = Record<
  (typeof reportDetailFields)[number][0],
  string
> & {
  identityType: string;
  evidenceNotes: string;
};
export const emptyReportDetails: ReportDetails = {
  location: "",
  bank: "",
  transactionDate: "",
  suspectName: "",
  suspectPhone: "",
  suspectEmail: "",
  suspectAccount: "",
  suspectAddress: "",
  suspectWebsite: "",
  suspectHandle: "",
  identityType: "Not supplied",
  evidenceNotes: "",
};
export const reportDetailsSchema = z
  .object({
    location: z.string().trim().min(2).max(160),
    bank: z.string().trim().min(2).max(120),
    transactionDate: z.iso.date(),
    suspectName: z.string().max(120),
    suspectPhone: z.string().max(40),
    suspectEmail: z.union([z.literal(""), z.email().max(120)]),
    suspectAccount: z.string().max(120),
    suspectAddress: z.string().max(200),
    suspectWebsite: z.union([z.literal(""), z.url().max(200)]),
    suspectHandle: z.string().max(120),
    identityType: z.enum([
      "Not supplied",
      "Synthetic voter ID",
      "Synthetic driving licence",
      "Synthetic passport",
      "Synthetic PAN",
      "Synthetic Aadhaar",
    ]),
    evidenceNotes: z.string().max(400),
  })
  .strict();

// Keep the report additions in the existing incident record, in the same case
// creation transaction, so both persistence adapters and case exports retain them.
export function reportNarrative(description: string, details: ReportDetails) {
  return `${description}\n\n--- Additional information supplied by citizen (synthetic demo) ---\n${[
    ...reportDetailFields.map(
      ([key, label]) => `${label}: ${details[key] || "Not known"}`,
    ),
    `Identity document type: ${details.identityType}`,
    `Evidence notes: ${details.evidenceNotes || "Not supplied"}`,
  ].join("\n")}`;
}

import { z } from "zod";

const text = z.string().max(600);
export const intelligenceSchema = z
  .object({
    summary: text,
    fraudType: z.enum([
      "Bank impersonation / phishing",
      "Investment scam",
      "Marketplace fraud",
      "OTP / account takeover",
      "Other financial cyber fraud",
    ]),
    reportedAmount: z.number().int().positive().max(10000000).nullable(),
    paymentChannel: z
      .enum(["UPI", "Bank transfer", "Card", "Wallet", "Other digital payment"])
      .nullable(),
    sourceInstitution: text
      .nullable()
      .describe(
        "The institution explicitly identified as holding the account money was debited from. Return null if not stated. A caller claiming to represent a bank does NOT identify the source institution. Example: 'Caller claimed Example Bank; I paid by UPI' means null.",
      ),
    beneficiaryInstitution: text
      .nullable()
      .describe(
        "The institution explicitly identified as receiving the money. Return null if unknown. Never use an impersonated institution or caller affiliation as the beneficiary institution.",
      ),
    transactionReferences: z.array(text).max(10),
    incidentDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    incidentTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    evidenceMentioned: z.array(text).max(10),
    known: z.array(text).max(8),
    inferred: z.array(text).max(5),
    missingInformation: z.array(text).max(8),
    recommendedAction: z.enum([
      "REQUEST_TRANSACTION_REFERENCE",
      "REQUEST_BENEFICIARY_DETAILS",
      "REQUEST_EVIDENCE",
      "IDENTIFY_BENEFICIARY_BANK",
      "SEND_FREEZE_REQUEST",
      "ASSIGN_CYBER_CELL",
      "START_FIR_REVIEW",
      "NO_ACTION",
    ]),
    reason: text,
  })
  .strict();
export type Intelligence = z.infer<typeof intelligenceSchema>;

// Identifier suggestions must be quoted in the supplied content, not inferred.
export function groundIdentifiers(
  result: Intelligence,
  source: string,
): Intelligence {
  const contains = (value: string) =>
    source.toLowerCase().includes(value.toLowerCase());
  return {
    ...result,
    sourceInstitution:
      result.sourceInstitution && contains(result.sourceInstitution)
        ? result.sourceInstitution
        : null,
    beneficiaryInstitution:
      result.beneficiaryInstitution && contains(result.beneficiaryInstitution)
        ? result.beneficiaryInstitution
        : null,
    transactionReferences: result.transactionReferences.filter(contains),
    reportedAmount:
      result.reportedAmount !== null &&
      source.replaceAll(",", "").includes(String(result.reportedAmount))
        ? result.reportedAmount
        : null,
  };
}

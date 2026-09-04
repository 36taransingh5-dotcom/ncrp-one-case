export type StructuredIntake = {
  fraudType: string;
  mechanism: string;
  paymentChannel: string;
  impersonatedEntity: string | null;
  confidence: number;
  summary: string;
};
/** Deterministic, explainable fallback used when no approved AI provider is configured. */
export function classifyIncident(description: string): StructuredIntake {
  const text = description.toLowerCase();
  const bank = /sbi|bank|kyc|account/.test(text);
  const apk = /apk|install|whatsapp/.test(text);
  return {
    fraudType: "Financial cyber fraud",
    mechanism:
      bank && apk
        ? "Bank impersonation + malicious APK"
        : bank
          ? "Bank impersonation"
          : "Suspected digital-payment fraud",
    paymentChannel: /upi/.test(text)
      ? "UPI"
      : /transfer|bank/.test(text)
        ? "Bank transfer"
        : "Digital payment",
    impersonatedEntity: /sbi/.test(text) ? "SBI (reported by citizen)" : null,
    confidence: bank ? 0.82 : 0.62,
    summary:
      bank && apk
        ? "Reported bank impersonation involving a malicious application and an unauthorised payment."
        : "Reported suspected financial cyber fraud; classification awaits operator review.",
  };
}

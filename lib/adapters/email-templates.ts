/** Transactional templates. Never include amounts, accounts or narratives. */
export const EMAIL_EVENT_TEMPLATES = {
  CASE_CREATED: {
    subject: (publicCaseId: string) =>
      `Case ${publicCaseId}: your report was received`,
    text: (publicCaseId: string) =>
      `Your report was recorded as case ${publicCaseId}. Sign in to the case page to follow the coordination desk. This message does not include payment or account details.`,
  },
  EVIDENCE_REQUESTED: {
    subject: (publicCaseId: string) =>
      `Case ${publicCaseId}: more information requested`,
    text: (publicCaseId: string) =>
      `The coordination desk has requested additional documents for case ${publicCaseId}. Sign in to the case page to see what is needed. This message does not include payment or account details.`,
  },
  FUNDS_SECURED: {
    subject: (publicCaseId: string) =>
      `Case ${publicCaseId}: funds-hold update`,
    text: (publicCaseId: string) =>
      `A funds-hold update was recorded on case ${publicCaseId}. Sign in to the case page for the current status. This message does not include amounts or account numbers.`,
  },
  AGENCY_ACKNOWLEDGED: {
    subject: (publicCaseId: string) =>
      `Case ${publicCaseId}: institution acknowledged`,
    text: (publicCaseId: string) =>
      `An institution acknowledged a request on case ${publicCaseId}. Sign in to the case page for the current owner and next action.`,
  },
  CYBER_CELL_ASSIGNED: {
    subject: (publicCaseId: string) =>
      `Case ${publicCaseId}: cyber cell assigned`,
    text: (publicCaseId: string) =>
      `A cyber cell assignment was recorded on case ${publicCaseId}. Sign in to the case page to see who owns the next action.`,
  },
  FIR_REGISTERED: {
    subject: (publicCaseId: string) => `Case ${publicCaseId}: FIR update`,
    text: (publicCaseId: string) =>
      `An FIR update was recorded on case ${publicCaseId}. Sign in to the case page for the current police status. This is not an official FIR document.`,
  },
  CASE_RESOLVED: {
    subject: (publicCaseId: string) =>
      `Case ${publicCaseId}: moved to resolution`,
    text: (publicCaseId: string) =>
      `Case ${publicCaseId} was moved to resolution. Sign in to the case page for the recorded outcome.`,
  },
} as const;

export type EmailEventType = keyof typeof EMAIL_EVENT_TEMPLATES;

export function emailTemplateFor(eventType: string) {
  return EMAIL_EVENT_TEMPLATES[eventType as EmailEventType] || null;
}

export function emailContainsSensitiveFinancialData(text: string) {
  return /₹|rs\.?\s*\d{2,}|\bIFSC\b|\bUPI\s*[:\-]|\b\d{9,}\b/i.test(text);
}

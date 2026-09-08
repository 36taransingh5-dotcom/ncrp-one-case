export type FreezeResult = {
  requestId: string;
  accepted: boolean;
  providerReference: string;
};
export type IntegrationContext = {
  idempotencyKey: string;
  timeoutMs: number;
  attemptCount?: number;
  demoFreezeRetry?: boolean;
};
export interface BankAdapter {
  notifyFraud(
    caseId: string,
    transactionId: string,
    context?: IntegrationContext,
  ): Promise<{ accepted: boolean; reference: string }>;
  identifyBeneficiaryBank(
    caseId: string,
    transactionRef: string,
    context?: IntegrationContext,
  ): Promise<{ institutionId: string; accountRef: string; reference: string }>;
  requestFreeze(
    caseId: string,
    accountRef: string,
    amount: number,
    context?: IntegrationContext,
  ): Promise<FreezeResult>;
  getFreezeStatus(
    providerReference: string,
    context?: IntegrationContext,
  ): Promise<{
    status: "pending" | "acknowledged" | "completed";
    securedAmount: number;
  }>;
  traceFunds(
    caseId: string,
    transactionRef: string,
    context?: IntegrationContext,
  ): Promise<{ traceReference: string; hops: number }>;
  reconcile(
    providerReference: string,
    context?: IntegrationContext,
  ): Promise<{ reconciled: boolean }>;
}
export interface PoliceAdapter {
  assignCyberCell(
    caseId: string,
    context?: IntegrationContext,
  ): Promise<{ assignmentReference: string }>;
  startFirReview(
    caseId: string,
    context?: IntegrationContext,
  ): Promise<{ reviewReference: string }>;
  registerFir(
    caseId: string,
    context?: IntegrationContext,
  ): Promise<{ firNumber: string }>;
  getStatus(
    caseId: string,
    context?: IntegrationContext,
  ): Promise<{ status: string; firNumber?: string }>;
}
export interface FraudReportingAdapter {
  createExternalComplaint(
    caseId: string,
    context?: IntegrationContext,
  ): Promise<{ externalReference: string }>;
  getComplaintStatus(
    externalReference: string,
    context?: IntegrationContext,
  ): Promise<{ status: string }>;
}
export type NotificationMessage = {
  recipient: string;
  template: string;
  caseReference: string;
  to?: string;
  publicCaseId?: string;
  subject?: string;
  text?: string;
};
export interface NotificationAdapter {
  send(
    input: NotificationMessage,
    context?: IntegrationContext,
  ): Promise<{ messageReference: string; provider?: string }>;
}

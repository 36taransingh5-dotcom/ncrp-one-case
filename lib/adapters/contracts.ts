export type FreezeResult = {
  requestId: string;
  accepted: boolean;
  providerReference: string;
};
export type IntegrationContext = {
  idempotencyKey: string;
  timeoutMs: number;
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
}
export interface FraudReportingAdapter {
  createExternalComplaint(
    caseId: string,
    context?: IntegrationContext,
  ): Promise<{ externalReference: string }>;
}
export interface NotificationAdapter {
  send(
    input: { recipient: string; template: string; caseReference: string },
    context?: IntegrationContext,
  ): Promise<{ messageReference: string }>;
}

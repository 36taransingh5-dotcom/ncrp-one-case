export type FreezeResult = { requestId: string; accepted: boolean; providerReference: string };
export interface BankAdapter { notifyFraud(caseId: string, transactionId: string): Promise<{accepted:boolean; reference:string}>; requestFreeze(caseId: string, accountRef: string, amount: number): Promise<FreezeResult>; }
export interface PoliceAdapter { assignCyberCell(caseId: string): Promise<{assignmentReference:string}>; startFirReview(caseId: string): Promise<{reviewReference:string}>; registerFir(caseId: string): Promise<{firNumber:string}>; }
export interface FraudReportingAdapter { createExternalComplaint(caseId: string): Promise<{externalReference:string}>; }

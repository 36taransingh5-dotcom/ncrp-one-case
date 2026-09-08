import { Resend } from "resend";
import type { NotificationAdapter } from "./contracts";
import { PermanentIntegrationError, RetryableIntegrationError } from "./errors";
import { emailContainsSensitiveFinancialData } from "./email-templates";
import { getResendFromAddress } from "./config";
import { logEvent } from "@/lib/observability";

export function createResendNotificationAdapter(input?: {
  apiKey?: string;
  from?: string;
}): NotificationAdapter {
  const apiKey = input?.apiKey || process.env.RESEND_API_KEY?.trim() || "";
  const from = input?.from?.trim() || getResendFromAddress();
  return {
    async send(message, context) {
      if (!apiKey || !from)
        throw new PermanentIntegrationError("Resend is not configured");
      const to = message.to?.trim();
      if (!to)
        throw new PermanentIntegrationError("Notification has no recipient");
      const subject =
        message.subject || `Case update ${message.publicCaseId || ""}`.trim();
      const text =
        message.text ||
        `There is a new update on your case. Sign in to the case page for details.`;
      if (
        emailContainsSensitiveFinancialData(subject) ||
        emailContainsSensitiveFinancialData(text)
      )
        throw new PermanentIntegrationError(
          "Email template contained financial data",
        );
      const resend = new Resend(apiKey);
      const timeoutMs =
        context?.timeoutMs && context.timeoutMs > 0 ? context.timeoutMs : 8_000;
      const sent = await Promise.race([
        resend.emails.send(
          {
            from,
            to,
            subject,
            text,
          },
          { idempotencyKey: context?.idempotencyKey },
        ),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new RetryableIntegrationError("Resend timed out")),
            timeoutMs,
          ),
        ),
      ]);
      if (sent.error) {
        const status = Number(
          (sent.error as { statusCode?: number }).statusCode || 0,
        );
        const detail = sent.error.message || "Resend rejected the message";
        if (status >= 500 || status === 429)
          throw new RetryableIntegrationError(detail);
        throw new PermanentIntegrationError(detail);
      }
      const messageId = String(sent.data?.id || "");
      if (!messageId)
        throw new RetryableIntegrationError("Resend returned no message id");
      logEvent("adapter.notification.send", {
        caseId: message.caseReference,
        operation: message.template,
        adapter: "resend",
      });
      return { messageReference: messageId, provider: "resend" };
    },
  };
}

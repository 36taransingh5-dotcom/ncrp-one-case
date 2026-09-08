import crypto from "node:crypto";

export function signWebhookBody(secret: string, body: string) {
  const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${digest}`;
}

export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string | null,
) {
  if (!secret || !header) return false;
  const expected = signWebhookBody(secret, body);
  const supplied = header.trim();
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export function tokenMatches(expected: string, authorization: string | null) {
  if (!expected || !authorization) return false;
  const supplied = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

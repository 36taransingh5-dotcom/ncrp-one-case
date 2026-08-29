type Metadata = Record<string, boolean | number | string | undefined>;

/**
 * Small structured logger for this vertical slice. It deliberately excludes
 * complaint narratives, uploaded file contents, cookies and unmasked PII.
 */
export function logEvent(event: string, metadata: Metadata = {}) {
  console.info(
    JSON.stringify({
      service: "ncrp-one-case",
      event,
      at: new Date().toISOString(),
      ...metadata,
    }),
  );
}

export function logFailure(
  event: string,
  error: unknown,
  metadata: Metadata = {},
) {
  logEvent(event, {
    ...metadata,
    outcome: "failure",
    reason: error instanceof Error ? error.message.slice(0, 180) : "unknown",
  });
}

export class IntegrationError extends Error {
  readonly retryable: boolean;
  readonly status?: number;
  constructor(
    message: string,
    options: { retryable: boolean; status?: number; cause?: unknown } = {
      retryable: false,
    },
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

export class RetryableIntegrationError extends IntegrationError {
  constructor(message: string, status?: number, cause?: unknown) {
    super(message, { retryable: true, status, cause });
  }
}

export class PermanentIntegrationError extends IntegrationError {
  constructor(message: string, status?: number, cause?: unknown) {
    super(message, { retryable: false, status, cause });
  }
}

export function isRetryableIntegrationError(error: unknown) {
  return error instanceof IntegrationError ? error.retryable : true;
}

export function isPermanentIntegrationError(error: unknown) {
  return error instanceof IntegrationError && !error.retryable;
}

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

/** Missing/invalid AI environment configuration — fail closed. */
export class AiConfigError extends AiError {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

export class AiTimeoutError extends AiError {
  constructor(message = "AI request timed out.") {
    super(message);
    this.name = "AiTimeoutError";
  }
}

export class AiProviderError extends AiError {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    message: string,
    options?: { retryable?: boolean; status?: number },
  ) {
    super(message);
    this.name = "AiProviderError";
    this.retryable = options?.retryable ?? false;
    this.status = options?.status;
  }
}

export class AiValidationError extends AiError {
  constructor(message: string) {
    super(message);
    this.name = "AiValidationError";
  }
}

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
  /** Provider error.code when available (never a secret). */
  readonly providerCode?: string | null;
  /** Provider error.type when available. */
  readonly providerType?: string | null;

  constructor(
    message: string,
    options?: {
      retryable?: boolean;
      status?: number;
      providerCode?: string | null;
      providerType?: string | null;
    },
  ) {
    super(message);
    this.name = "AiProviderError";
    this.retryable = options?.retryable ?? false;
    this.status = options?.status;
    this.providerCode = options?.providerCode ?? null;
    this.providerType = options?.providerType ?? null;
  }
}

export type AiValidationIssue = {
  path: string;
  code: string;
  expected?: string;
};

export class AiValidationError extends AiError {
  readonly issues?: AiValidationIssue[];
  /** Usage returned with the response before validation failed (never invented). */
  readonly usage?: {
    inputTokens?: number;
    outputTokens?: number;
    webSearchCalls?: number;
  };

  constructor(
    message: string,
    options?: {
      issues?: AiValidationIssue[];
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        webSearchCalls?: number;
      };
    },
  ) {
    super(message);
    this.name = "AiValidationError";
    this.issues = options?.issues;
    this.usage = options?.usage;
  }
}

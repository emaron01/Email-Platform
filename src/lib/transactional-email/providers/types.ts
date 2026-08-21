export type SendTransactionalMessageInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendTransactionalMessageResult = {
  providerMessageId: string | null;
};

/**
 * Platform transactional email transport.
 * Implementations: console | resend | smtp
 */
export type TransactionalEmailProvider = {
  readonly name: "console" | "resend" | "smtp";
  send(
    input: SendTransactionalMessageInput,
  ): Promise<SendTransactionalMessageResult>;
  /** Optional connectivity check (SMTP). Must never expose credentials. */
  verify?(): Promise<void>;
};

export type TransactionalEmailFailureCategory =
  | "TRANSIENT"
  | "AUTH"
  | "CONFIG"
  | "RECIPIENT"
  | "PERMANENT"
  | "PROVIDER_ERROR";

export class TransactionalEmailSendError extends Error {
  readonly category: TransactionalEmailFailureCategory;
  readonly retryable: boolean;

  constructor(
    message: string,
    category: TransactionalEmailFailureCategory,
    retryable: boolean,
  ) {
    super(message);
    this.name = "TransactionalEmailSendError";
    this.category = category;
    this.retryable = retryable;
  }
}

/** Reject header injection / malformed recipient before transport. */
export function assertSafeRecipient(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 320) {
    throw new TransactionalEmailSendError(
      "Invalid recipient address.",
      "RECIPIENT",
      false,
    );
  }
  if (/[\r\n\0]/.test(normalized)) {
    throw new TransactionalEmailSendError(
      "Recipient address contains invalid characters.",
      "RECIPIENT",
      false,
    );
  }
  // Practical production check — not a full RFC parser.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new TransactionalEmailSendError(
      "Invalid recipient address syntax.",
      "RECIPIENT",
      false,
    );
  }
  return normalized;
}

export function assertSafeSubject(subject: string): string {
  if (/[\r\n\0]/.test(subject)) {
    throw new TransactionalEmailSendError(
      "Subject contains invalid characters.",
      "PERMANENT",
      false,
    );
  }
  return subject;
}

/**
 * Test-runtime guards for transactional email.
 * Production and development paths never match isTransactionalEmailTestRuntime().
 */

/** True under Vitest or when NODE_ENV=test (never in production `next start`). */
export function isTransactionalEmailTestRuntime(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    process.env.VITEST_WORKER_ID != null
  );
}

/**
 * Explicit opt-in for SMTP adapter tests that mock nodemailer.
 * Never set in .env.local — only in tests that mock transport.
 */
export function isLiveSmtpExplicitlyAllowedInTests(): boolean {
  return process.env.TRANSACTIONAL_EMAIL_ALLOW_LIVE_SMTP_IN_TESTS === "1";
}

export class LiveSmtpBlockedInTestError extends Error {
  readonly templateKey?: string;
  readonly recipient?: string;

  constructor(
    message: string,
    options?: { templateKey?: string; recipient?: string },
  ) {
    super(message);
    this.name = "LiveSmtpBlockedInTestError";
    this.templateKey = options?.templateKey;
    this.recipient = options?.recipient;
  }
}

/** Fail loudly if a test attempts live SMTP without mocking + opt-in. */
export function assertLiveSmtpAllowedInTests(context: {
  phase: "construct" | "send" | "verify";
  templateKey?: string;
  recipient?: string;
}): void {
  if (!isTransactionalEmailTestRuntime()) return;
  if (isLiveSmtpExplicitlyAllowedInTests()) return;

  const template = context.templateKey ?? "(unknown template)";
  const recipient = context.recipient ?? "(unknown recipient)";
  throw new LiveSmtpBlockedInTestError(
    `Live SMTP ${context.phase} is blocked while running tests ` +
      `(template=${template}, recipient=${recipient}). ` +
      `Tests must use TRANSACTIONAL_EMAIL_PROVIDER=console by default, or set ` +
      `TRANSACTIONAL_EMAIL_ALLOW_LIVE_SMTP_IN_TESTS=1 when exercising SMTP with a mocked transport.`,
    { templateKey: context.templateKey, recipient: context.recipient },
  );
}

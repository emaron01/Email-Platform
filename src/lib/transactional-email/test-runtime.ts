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

/** Fail loudly if a test attempts a live mail provider (SMTP or Resend HTTP). */
export function assertLiveTransactionalEmailBlockedInTests(context: {
  phase: "construct" | "send" | "verify";
  provider: "smtp" | "resend";
  templateKey?: string;
  recipient?: string;
}): void {
  if (!isTransactionalEmailTestRuntime()) return;

  const template = context.templateKey ?? "(unknown template)";
  const recipient = context.recipient ?? "(unknown recipient)";
  throw new LiveSmtpBlockedInTestError(
    `Live ${context.provider.toUpperCase()} ${context.phase} is blocked while running tests ` +
      `(template=${template}, recipient=${recipient}). ` +
      `Tests must use TRANSACTIONAL_EMAIL_PROVIDER=console. ` +
      `SMTP/Resend adapter tests must mock transport/fetch in the test file.`,
    { templateKey: context.templateKey, recipient: context.recipient },
  );
}

/** @deprecated Use assertLiveTransactionalEmailBlockedInTests */
export function assertLiveSmtpAllowedInTests(context: {
  phase: "construct" | "send" | "verify";
  templateKey?: string;
  recipient?: string;
}): void {
  assertLiveTransactionalEmailBlockedInTests({
    ...context,
    provider: "smtp",
  });
}

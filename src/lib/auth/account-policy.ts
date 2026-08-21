/**
 * Central account-state / verification policy.
 * Do not scatter `if (!emailVerified)` across the app — use these helpers.
 *
 * Unverified accounts MAY:
 * - view account settings
 * - resend verification
 * - logout
 * - read limited dashboard shell
 *
 * Unverified accounts MUST NOT:
 * - spend external AI (research / scoring)
 * - create invitations
 * - change billing profile
 * - generate/send outbound sales email (future)
 */
export type AccountCapability =
  | "VIEW_APP"
  | "AI_SPEND"
  | "MANAGE_INVITATIONS"
  | "MANAGE_BILLING"
  | "OUTBOUND_EMAIL"
  | "CHANGE_ORG_POLICY";

export function isEmailVerified(user: {
  emailVerifiedAt: Date | null;
}): boolean {
  return Boolean(user.emailVerifiedAt);
}

export function canPerform(
  user: { emailVerifiedAt: Date | null },
  capability: AccountCapability,
): boolean {
  const verified = isEmailVerified(user);
  switch (capability) {
    case "VIEW_APP":
      return true;
    case "AI_SPEND":
    case "MANAGE_INVITATIONS":
    case "MANAGE_BILLING":
    case "OUTBOUND_EMAIL":
    case "CHANGE_ORG_POLICY":
      return verified;
    default:
      return false;
  }
}

export function assertAccountCapability(
  user: { emailVerifiedAt: Date | null },
  capability: AccountCapability,
): void {
  if (!canPerform(user, capability)) {
    throw new Error(
      "Verify your email address to continue with this action.",
    );
  }
}

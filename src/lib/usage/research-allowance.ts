/**
 * Company research entitlement copy and thresholds.
 * Safe for client + server — no DB imports.
 */

/** Heads-up when this many (or fewer) new-company slots remain. Does not block. */
export const ACTIVE_RESEARCHED_COMPANY_WARN_REMAINING = 10;

/** Paid Standard company floor (catalog). Used in trial-exhaustion conversion copy. */
export const STANDARD_ACTIVE_COMPANY_LIMIT = 100;

export type ActiveResearchedCompanyUsageView = {
  used: number;
  limit: number;
  remaining: number;
  warning: boolean;
  exhausted: boolean;
};

export function toActiveResearchedCompanyUsageView(input: {
  used: number;
  limit: number;
}): ActiveResearchedCompanyUsageView {
  const used = Math.max(0, input.used);
  const limit = Math.max(0, input.limit);
  const remaining = Math.max(0, limit - used);
  return {
    used,
    limit,
    remaining,
    warning:
      remaining > 0 && remaining <= ACTIVE_RESEARCHED_COMPANY_WARN_REMAINING,
    exhausted: remaining <= 0,
  };
}

export function formatResearchAllowanceSummary(
  usage: Pick<ActiveResearchedCompanyUsageView, "remaining" | "limit" | "used">,
): string {
  if (usage.limit <= 0) {
    return "No company research allowance on this account.";
  }
  if (usage.remaining <= 0) {
    return `Company research allowance used (${usage.used} of ${usage.limit}).`;
  }
  return `${usage.remaining} of ${usage.limit} company research slots remaining.`;
}

export function formatResearchAllowanceWarning(remaining: number): string {
  const slots =
    remaining === 1
      ? "1 company research slot left"
      : `${remaining} company research slots left`;
  return `You have ${slots} in your allowance. Continue to use the remaining slots, or add capacity before you run out.`;
}

export function formatResearchAllowanceExhausted(limit: number): string {
  return `You've used your company research allowance (${limit} companies). Add capacity in Billing to research new companies. Scoring, email generation, and sending still work for companies you've already researched.`;
}

/**
 * Mid-trial hit of the 25-company cap — conversion copy, not a bare quota error.
 */
export function formatTrialResearchExhausted(input: {
  trialLimit: number;
  paidLimit?: number;
}): string {
  const paid = input.paidLimit ?? STANDARD_ACTIVE_COMPANY_LIMIT;
  return `You've used your trial company research (${input.trialLimit} companies). Convert to Standard to research up to ${paid} companies. Scoring, email generation, and sending still work for companies you've already researched.`;
}

export function formatResearchQuotaBlockedMessage(input: {
  used: number;
  limit: number;
  billingStatus?: string | null;
}): string {
  if (input.billingStatus === "TRIALING") {
    return formatTrialResearchExhausted({ trialLimit: input.limit });
  }
  return formatResearchAllowanceExhausted(input.limit);
}

export const RESEARCH_BILLING_HREF = "/settings/billing";

/**
 * Seat / invite policy for organizations.
 *
 * Today:
 * - INDIVIDUAL Standard (self-serve): 1 user — org-admin invites blocked
 * - COMPED (platform): invites allowed; super admin sets limits deliberately
 * - ENTERPRISE: multi-user invites allowed
 *
 * Future (not built):
 * - PREMIUM: 2–10 seats via Stripe subscription quantity
 *   Use FUTURE_PREMIUM_SEAT_MIN/MAX when wiring Checkout quantity later.
 */
import { BILLING_PLAN_COMPED } from "@/lib/billing/plans";

/** Reserved for Premium seat purchasing (Stripe quantity) — not implemented. */
export const FUTURE_PREMIUM_SEAT_MIN = 2;
export const FUTURE_PREMIUM_SEAT_MAX = 10;

export function isCompedPlanCode(planCode: string | null | undefined): boolean {
  return planCode === BILLING_PLAN_COMPED || planCode === "FREE";
}

export function individualOrgAdminInviteBlockMessage(): string {
  const support =
    process.env.SUPPORT_EMAIL?.trim() ||
    process.env.TRANSACTIONAL_EMAIL_SUPPORT_EMAIL?.trim() ||
    null;
  const contact = support
    ? `Contact ${support} if you need a team workspace now.`
    : "Contact support if you need a team workspace now.";
  return (
    "Individual Standard accounts are limited to one user. " +
    "Team accounts are coming soon. " +
    contact
  );
}

/**
 * Whether org OWNER/ADMIN may create invitations for this workspace.
 * Platform invites use a separate path and are not gated here.
 */
export function orgAdminInvitesAllowed(input: {
  accountType: "INDIVIDUAL" | "ENTERPRISE" | string;
  planCode: string | null | undefined;
}): boolean {
  if (input.accountType === "ENTERPRISE") return true;
  if (isCompedPlanCode(input.planCode)) return true;
  // INDIVIDUAL self-serve / billed Standard (and future paid non-comped): one seat.
  return false;
}

/** Null when invites are allowed; otherwise the user-facing denial message. */
export function orgAdminInviteDenialReason(input: {
  accountType: "INDIVIDUAL" | "ENTERPRISE" | string;
  planCode: string | null | undefined;
}): string | null {
  return orgAdminInvitesAllowed(input)
    ? null
    : individualOrgAdminInviteBlockMessage();
}

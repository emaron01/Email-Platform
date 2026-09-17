/**
 * Pure pending-signup intent parse/build (no Next cookies).
 */
import {
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
} from "@/lib/billing/plans";
import {
  clampSeatQuantity,
  defaultMaxSeatsForPlan,
  defaultSeatQuantityForPlan,
} from "@/lib/org/seat-limits";

export const PENDING_SIGNUP_COOKIE = "pending_signup_intent";

export type PendingSignupIntent = {
  planCode: typeof BILLING_PLAN_STANDARD | typeof BILLING_PLAN_TEAM;
  seatQuantity: number;
  companyName?: string;
};

export function isInviteSignupNext(next: string | null | undefined): boolean {
  if (!next) return false;
  return next.includes("/invite/accept");
}

export function parsePendingSignupIntent(
  raw: unknown,
): PendingSignupIntent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const planCode = String(obj.planCode || "").trim();
  if (planCode !== BILLING_PLAN_STANDARD && planCode !== BILLING_PLAN_TEAM) {
    return null;
  }
  const maxSeats = defaultMaxSeatsForPlan(planCode);
  const rawQty =
    typeof obj.seatQuantity === "number"
      ? obj.seatQuantity
      : Number.parseInt(String(obj.seatQuantity ?? ""), 10);
  const seatQuantity = Number.isFinite(rawQty)
    ? clampSeatQuantity({
        planCode,
        quantity: rawQty,
        maxSeats,
      })
    : defaultSeatQuantityForPlan(planCode);

  const companyName =
    typeof obj.companyName === "string" ? obj.companyName.trim() : "";

  return {
    planCode,
    seatQuantity,
    ...(companyName ? { companyName: companyName.slice(0, 120) } : {}),
  };
}

export function buildPendingSignupIntent(input: {
  planCode: string;
  seatQuantity?: number;
  companyName?: string;
}): PendingSignupIntent | null {
  return parsePendingSignupIntent({
    planCode: input.planCode,
    seatQuantity:
      input.seatQuantity ?? defaultSeatQuantityForPlan(input.planCode),
    companyName: input.companyName,
  });
}

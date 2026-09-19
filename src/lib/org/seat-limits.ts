/**
 * Seat quantity / invite capacity for Team and Enterprise orgs.
 */
import {
  BILLING_PLAN_ENTERPRISE,
  BILLING_PLAN_STANDARD,
  canonicalPlanCode,
  getPlanDefinition,
  planAllowsSelfServeSeatChanges,
  planUsesSeatBilling,
} from "@/lib/billing/plans";

export const SEAT_LIMIT_REACHED_MESSAGE =
  "Seat limit reached. Add a seat to continue.";

export type SeatSnapshot = {
  planCode: string;
  seatQuantity: number;
  maxSeats: number;
  usedSeats: number;
  availableSeats: number;
  canAddSeatSelfServe: boolean;
  canInvite: boolean;
  inviteDenialReason: string | null;
};

export function defaultMaxSeatsForPlan(planCode: string): number {
  const code = canonicalPlanCode(planCode);
  const plan = getPlanDefinition(code) ?? getPlanDefinition(planCode);
  if (!plan) return 1;
  if (code === BILLING_PLAN_ENTERPRISE) {
    // Default cap until SUPER_ADMIN raises it.
    return plan.seats.seatMin > 0 ? 10 : 10;
  }
  if (plan.seats.seatMax != null) return plan.seats.seatMax;
  if (code === BILLING_PLAN_STANDARD) return 1;
  return plan.seats.seatMin;
}

export function defaultSeatQuantityForPlan(planCode: string): number {
  const code = canonicalPlanCode(planCode);
  const plan = getPlanDefinition(code) ?? getPlanDefinition(planCode);
  if (!plan) return 1;
  if (planUsesSeatBilling(code)) return plan.seats.seatMin;
  return 1;
}

export function clampSeatQuantity(input: {
  planCode: string;
  quantity: number;
  maxSeats: number;
}): number {
  const plan =
    getPlanDefinition(canonicalPlanCode(input.planCode)) ??
    getPlanDefinition(input.planCode);
  const min = plan?.seats.seatMin ?? 1;
  const hardMax =
    plan?.seats.seatMax != null
      ? Math.min(plan.seats.seatMax, input.maxSeats)
      : input.maxSeats;
  return Math.max(min, Math.min(hardMax, Math.floor(input.quantity)));
}

export function buildSeatSnapshot(input: {
  planCode: string;
  seatQuantity: number;
  maxSeats: number;
  usedSeats: number;
}): SeatSnapshot {
  const code = canonicalPlanCode(input.planCode);
  const seatQuantity = Math.max(1, input.seatQuantity);
  const maxSeats = Math.max(1, input.maxSeats);
  const usedSeats = Math.max(0, input.usedSeats);
  const availableSeats = Math.max(0, seatQuantity - usedSeats);
  const canInvite = availableSeats > 0;
  const plan = getPlanDefinition(code);
  const planMax = plan?.seats.seatMax;
  const canAddSeatSelfServe =
    planAllowsSelfServeSeatChanges(code) &&
    seatQuantity < maxSeats &&
    (planMax == null || seatQuantity < planMax);

  return {
    planCode: code,
    seatQuantity,
    maxSeats,
    usedSeats,
    availableSeats,
    canAddSeatSelfServe,
    canInvite,
    inviteDenialReason: canInvite ? null : SEAT_LIMIT_REACHED_MESSAGE,
  };
}

export function formatSeatsUsedLabel(input: {
  usedSeats: number;
  seatQuantity: number;
}): string {
  return `${input.usedSeats} of ${input.seatQuantity} seats used`;
}

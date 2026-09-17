/**
 * Cookie read/write for pending self-serve signup intent.
 */
import "server-only";

import { cookies } from "next/headers";
import { BILLING_PLAN_STANDARD } from "@/lib/billing/plans";
import {
  buildPendingSignupIntent,
  parsePendingSignupIntent,
  PENDING_SIGNUP_COOKIE,
  type PendingSignupIntent,
} from "@/lib/billing/pending-signup-intent";
import { defaultSeatQuantityForPlan } from "@/lib/org/seat-limits";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export async function readPendingSignupIntent(): Promise<PendingSignupIntent | null> {
  const jar = await cookies();
  const raw = jar.get(PENDING_SIGNUP_COOKIE)?.value;
  if (!raw) return null;
  try {
    return parsePendingSignupIntent(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writePendingSignupIntent(
  intent: PendingSignupIntent,
): Promise<void> {
  const jar = await cookies();
  jar.set(PENDING_SIGNUP_COOKIE, JSON.stringify(intent), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SEC,
  });
}

export async function clearPendingSignupIntent(): Promise<void> {
  const jar = await cookies();
  jar.delete(PENDING_SIGNUP_COOKIE);
}

export async function mergePendingSignupIntent(
  patch: Partial<PendingSignupIntent> & { planCode?: string },
): Promise<PendingSignupIntent | null> {
  const existing = await readPendingSignupIntent();
  const planCode =
    patch.planCode ?? existing?.planCode ?? BILLING_PLAN_STANDARD;
  const seatQuantity =
    patch.seatQuantity ??
    existing?.seatQuantity ??
    defaultSeatQuantityForPlan(planCode);
  const companyName =
    patch.companyName !== undefined
      ? patch.companyName
      : existing?.companyName;
  const next = buildPendingSignupIntent({
    planCode,
    seatQuantity,
    companyName,
  });
  if (!next) return null;
  await writePendingSignupIntent(next);
  return next;
}

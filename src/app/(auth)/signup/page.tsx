import { redirect } from "next/navigation";
import {
  isInviteSignupNext,
} from "@/lib/billing/pending-signup-intent";
import { readPendingSignupIntent } from "@/lib/billing/pending-signup-intent-cookie";
import { SignupForm } from "@/components/auth/SignupForm";

export const dynamic = "force-dynamic";

/**
 * Account details after plan selection (or invite accept).
 * Self-serve without a plan cookie redirects to /signup/plan.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const nextRaw = params.next;
  const next = typeof nextRaw === "string" ? nextRaw : "";
  const emailRaw = params.email;
  const defaultEmail = typeof emailRaw === "string" ? emailRaw.trim() : "";
  const invite = isInviteSignupNext(next);
  const intent = invite ? null : await readPendingSignupIntent();

  if (!invite && !intent) {
    redirect("/signup/plan");
  }

  let planSummary: string | null = null;
  if (intent) {
    planSummary =
      intent.planCode === "TEAM"
        ? `Team · ${intent.seatQuantity} users`
        : "Standard";
  }

  return (
    <SignupForm
      next={next}
      planSummary={planSummary}
      requirePlan={!invite}
      defaultEmail={defaultEmail}
    />
  );
}

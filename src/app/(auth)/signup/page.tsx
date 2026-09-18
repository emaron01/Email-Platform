import { redirect } from "next/navigation";
import {
  isInviteSignupNext,
} from "@/lib/billing/pending-signup-intent";
import { readPendingSignupIntent } from "@/lib/billing/pending-signup-intent-cookie";
import { getInvitationPreviewByRawToken } from "@/lib/org/signup";
import { SignupForm } from "@/components/auth/SignupForm";

export const dynamic = "force-dynamic";

function inviteTokenFromNext(next: string): string | null {
  try {
    const url = new URL(next, "http://local.invalid");
    if (!url.pathname.startsWith("/invite/accept")) return null;
    const token = url.searchParams.get("token")?.trim();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Account details after plan selection (or invite accept).
 * Self-serve without a plan cookie redirects to /signup/plan.
 * Invite signup skips plan selection and Checkout — joins an existing org.
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
  const emailParam = typeof emailRaw === "string" ? emailRaw.trim() : "";
  const companyRaw = params.company;
  const companyParam =
    typeof companyRaw === "string" ? companyRaw.trim().slice(0, 120) : "";
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

  let defaultEmail = emailParam;
  let defaultCompanyName = companyParam || intent?.companyName || "";
  let workspaceName: string | null = companyParam || null;

  if (invite) {
    const token = inviteTokenFromNext(next);
    const preview = token ? await getInvitationPreviewByRawToken(token) : null;
    if (preview) {
      defaultEmail = preview.email;
      defaultCompanyName = preview.organizationName;
      workspaceName = preview.organizationName;
    }
  }

  return (
    <SignupForm
      next={next}
      planSummary={planSummary}
      requirePlan={!invite}
      defaultEmail={defaultEmail}
      defaultCompanyName={defaultCompanyName}
      workspaceName={workspaceName}
      inviteMode={invite}
    />
  );
}

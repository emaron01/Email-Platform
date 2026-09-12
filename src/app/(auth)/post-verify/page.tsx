import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import {
  ONBOARDING_EULA_PATH,
  ONBOARDING_SUBSCRIBE_PATH,
} from "@/lib/billing/paths";
import { userNeedsEulaAcceptance } from "@/lib/legal/eula";

/**
 * Better Auth email-verification callback landing.
 * callbackURL for verification emails should be `/post-verify` so:
 * - success → smart redirect (eula / subscribe / workspace / platform / no-workspace)
 * - failure → `/post-verify?error=INVALID_TOKEN` → verify-email UX (not Dashboard)
 */
export default async function PostVerifyPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const error = params.error?.trim();
  if (error) {
    redirect(`/verify-email?error=${encodeURIComponent(error)}`);
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/verify-email?error=INVALID_TOKEN");
  }

  // Existing verified identities skip AuthUser create — ensure a workspace exists.
  if (user.platformRole === "NONE" && user.authUserId) {
    const { provisionIndividualWorkspace } = await import(
      "@/lib/auth/provision"
    );
    await provisionIndividualWorkspace({
      authUserId: user.authUserId,
      email: user.email,
      firstName: user.firstName?.trim() || "User",
      lastName: user.lastName?.trim() || "",
    });
  }

  const eula = await userNeedsEulaAcceptance(user.id);
  if (eula.needs) {
    redirect(ONBOARDING_EULA_PATH);
  }

  const organization = await getCurrentOrganization();
  if (organization) {
    const { prisma } = await import("@/lib/prisma");
    const { requiresStripeCheckout } = await import(
      "@/lib/billing/billing-state"
    );
    const billing = await prisma.organizationBillingProfile.findUnique({
      where: { organizationId: organization.id },
      select: {
        planCode: true,
        billingStatus: true,
        stripeSubscriptionId: true,
      },
    });
    if (billing && requiresStripeCheckout(billing)) {
      redirect(ONBOARDING_SUBSCRIBE_PATH);
    }
    redirect("/");
  }

  if (user.platformRole === "SUPER_ADMIN") {
    redirect("/settings/account");
  }

  redirect("/no-workspace");
}

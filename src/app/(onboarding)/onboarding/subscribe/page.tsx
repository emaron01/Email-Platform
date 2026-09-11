import { redirect } from "next/navigation";
import { requireOrgAdmin } from "@/lib/org/authz";
import { prisma } from "@/lib/prisma";
import {
  billingPlanLabel,
  requiresStripeCheckout,
} from "@/lib/billing/billing-state";
import { fetchSellableCatalogPrices } from "@/lib/billing/fetch-catalog-prices";
import {
  BILLING_PLAN_STANDARD,
  planIsCheckoutReady,
} from "@/lib/billing/plans";
import { resolveTrialPeriodDays } from "@/lib/billing/trial-period";
import { stripeConfigured } from "@/lib/billing/stripe";
import { StartFreeTrialButton } from "@/components/billing/StartFreeTrialButton";

export const dynamic = "force-dynamic";

/**
 * Post-verify subscribe pitch — unpaid self-serve only.
 * Not available once a Stripe subscription is active.
 * Trial copy follows BILLING_TRIAL_PERIOD_DAYS for NEW signups only.
 */
export default async function OnboardingSubscribePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organization } = await requireOrgAdmin();
  const params = searchParams ? await searchParams : {};
  const checkoutState =
    typeof params.checkout === "string" ? params.checkout : null;

  const billing = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId: organization.id },
  });

  const hasLiveSubscription =
    Boolean(billing?.stripeSubscriptionId) &&
    (billing?.billingStatus === "ACTIVE" ||
      billing?.billingStatus === "TRIALING" ||
      billing?.billingStatus === "PAST_DUE");

  if (hasLiveSubscription) {
    redirect("/");
  }

  // Comped durable accounts skip this pitch.
  if (
    billing &&
    !requiresStripeCheckout(billing) &&
    billing.billingStatus === "FREE"
  ) {
    redirect("/");
  }

  const catalog = await fetchSellableCatalogPrices();
  const standard =
    catalog.plans.find((p) => p.planCode === BILLING_PLAN_STANDARD) ??
    catalog.plans[0] ??
    null;

  let ctaDisabled: string | null = null;
  if (!stripeConfigured() || !planIsCheckoutReady(BILLING_PLAN_STANDARD)) {
    ctaDisabled =
      "Checkout is not configured yet. Contact support if this persists.";
  }

  const trialPeriodDays = resolveTrialPeriodDays();
  const trialOff = trialPeriodDays == null;

  return (
    <div className="space-y-8" data-testid="onboarding-subscribe-page">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          {trialOff ? "Subscribe to Standard" : "Start Your Free Trial"}
        </h1>
        <p className="text-base text-slate-600">
          {trialOff
            ? "Billing starts when Checkout completes. Cancel anytime."
            : "No charge until your trial ends. Cancel anytime."}
        </p>
      </div>

      {checkoutState === "canceled" ? (
        <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          Checkout canceled — no charge was made. You can start again below.
        </p>
      ) : null}

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        {catalog.plans.length > 1 ? (
          <ul className="space-y-4">
            {catalog.plans.map((plan) => (
              <li
                key={plan.priceId}
                className="border-b border-slate-100 pb-4 last:border-0 last:pb-0"
              >
                <p className="text-lg font-medium text-slate-900">{plan.name}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                  {plan.priceLabel ?? "See pricing at checkout"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div>
            <p className="text-lg font-medium text-slate-900">
              {standard?.name ?? billingPlanLabel(BILLING_PLAN_STANDARD)}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              {catalog.usedFallback || !standard?.priceLabel
                ? "See pricing at checkout"
                : standard.priceLabel}
            </p>
          </div>
        )}

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            What&apos;s included
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>
              {trialOff
                ? "Research up to 100 companies on Standard"
                : `Research up to 25 companies during your ${trialPeriodDays}-day trial (100 on a paid plan)`}
            </li>
            <li>Up to 50 curated emails per day (1,000 per month)</li>
            <li>
              Outlook Desktop, Microsoft 365, and Google Workspace sending
            </li>
            <li>
              Emails sent through your existing mailbox — replies come to you
            </li>
            <li>
              Add Company Research Credits in blocks of 100 for $30 each
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            The 50/day sending limit protects your domain&apos;s email
            reputation and deliverability.
          </p>
        </div>

        <p className="text-sm text-slate-600">
          {trialOff
            ? "Cancel anytime. Cancellations take effect at the end of the current billing cycle."
            : "Cancel anytime before your trial ends and you won\u2019t be charged. Cancellations take effect at the end of the current billing cycle."}
        </p>

        <StartFreeTrialButton
          disabledReason={ctaDisabled}
          trialPeriodDays={trialPeriodDays}
        />
      </section>
    </div>
  );
}

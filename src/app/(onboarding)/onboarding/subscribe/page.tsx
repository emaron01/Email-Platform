import { redirect } from "next/navigation";
import { requireOrgAdmin } from "@/lib/org/authz";
import { prisma } from "@/lib/prisma";
import { requiresStripeCheckout } from "@/lib/billing/billing-state";
import { loadCatalogPlan } from "@/lib/billing/effective-catalog";
import { fetchSellableCatalogPrices } from "@/lib/billing/fetch-catalog-prices";
import { BILLING_PLAN_STANDARD } from "@/lib/billing/plans";
import { effectivePricesAreCheckoutReady } from "@/lib/billing/billing-prices";
import { loadEffectiveBillingPrices } from "@/lib/billing/effective-prices";
import { loadEffectiveTrialPeriod } from "@/lib/billing/effective-trial";
import { stripeConfigured } from "@/lib/billing/stripe";
import { StartFreeTrialButton } from "@/components/billing/StartFreeTrialButton";
import { defaultBillingCatalogSetting } from "@/lib/billing/billing-catalog";

export const dynamic = "force-dynamic";

/**
 * Post-verify subscribe pitch — unpaid self-serve only.
 * Marketing copy + floors from billing.catalog (code fallback).
 * Price amount from Stripe via billing.prices.
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

  if (
    billing &&
    !requiresStripeCheckout(billing) &&
    billing.billingStatus === "FREE"
  ) {
    redirect("/");
  }

  const [priceCatalog, prices, trial, catalogLoad] = await Promise.all([
    fetchSellableCatalogPrices(),
    loadEffectiveBillingPrices(),
    loadEffectiveTrialPeriod({ planCode: BILLING_PLAN_STANDARD }),
    loadCatalogPlan(BILLING_PLAN_STANDARD).catch(() => ({
      plan: defaultBillingCatalogSetting().plans.find(
        (p) => p.planCode === BILLING_PLAN_STANDARD,
      )!,
      catalog: defaultBillingCatalogSetting(),
      source: "code" as const,
    })),
  ]);

  const standardPrice =
    priceCatalog.plans.find((p) => p.planCode === BILLING_PLAN_STANDARD) ??
    priceCatalog.plans[0] ??
    null;

  const plan = catalogLoad.plan;
  const fallbackPlan = defaultBillingCatalogSetting().plans.find(
    (p) => p.planCode === BILLING_PLAN_STANDARD,
  )!;

  const displayName = plan.displayName || fallbackPlan.displayName;
  const tagline = plan.tagline || fallbackPlan.tagline;
  const featureBullets =
    plan.featureBullets.length > 0
      ? plan.featureBullets
      : fallbackPlan.featureBullets;
  const trialNote = plan.trialNote || fallbackPlan.trialNote;

  let ctaDisabled: string | null = null;
  if (!stripeConfigured() || !effectivePricesAreCheckoutReady(prices)) {
    ctaDisabled =
      "Checkout is not configured yet. Contact support if this persists.";
  }

  const trialPeriodDays = trial.days;
  const trialOff = trialPeriodDays == null;

  const credits = plan.companyCredits ?? fallbackPlan.companyCredits;
  const creditsBulletNote =
    credits?.displayPriceNote?.trim() ||
    (credits
      ? `Add Company Research Credits in blocks of ${credits.blockSize}`
      : null);

  return (
    <div className="space-y-8" data-testid="onboarding-subscribe-page">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          {trialOff ? `Subscribe to ${displayName}` : "Start Your Free Trial"}
        </h1>
        <p className="text-base text-slate-600">
          {tagline
            ? tagline
            : trialOff
              ? "Billing starts when Checkout completes. Cancel anytime."
              : "No charge until your trial ends. Cancel anytime."}
        </p>
        {!tagline ? null : (
          <p className="text-sm text-slate-600">
            {trialOff
              ? "Billing starts when Checkout completes. Cancel anytime."
              : "No charge until your trial ends. Cancel anytime."}
          </p>
        )}
      </div>

      {checkoutState === "canceled" ? (
        <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          Checkout canceled — no charge was made. You can start again below.
        </p>
      ) : null}

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <p className="text-lg font-medium text-slate-900">{displayName}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {priceCatalog.usedFallback || !standardPrice?.priceLabel
              ? "See pricing at checkout"
              : standardPrice.priceLabel}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            What&apos;s included
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
            {featureBullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
            {creditsBulletNote &&
            !featureBullets.some((b) =>
              b.toLowerCase().includes("company research credit"),
            ) ? (
              <li>{creditsBulletNote}</li>
            ) : null}
          </ul>
          {trialNote ? (
            <p className="mt-3 text-xs text-slate-500">{trialNote}</p>
          ) : null}
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

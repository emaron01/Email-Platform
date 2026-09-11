import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrgAdmin } from "@/lib/org/authz";
import { prisma } from "@/lib/prisma";
import {
  BILLING_PLAN_COMPED,
  billingPlanDescription,
  billingPlanLabel,
  billingStatusLabel,
  formatBillingDate,
  formatCustomerPayingAmount,
  formatDiscountSummary,
  formatTrialEndsSummary,
  requiresStripeCheckout,
} from "@/lib/billing/billing-state";
import { ONBOARDING_SUBSCRIBE_PATH } from "@/lib/billing/paths";
import { hasActiveDiscount } from "@/lib/billing/price-discount-mirror";
import {
  BILLING_PLAN_STANDARD,
  getPlanDefinition,
  resolveEntitlementsForStatus,
} from "@/lib/billing/plans";
import { BillingCheckoutRefresh } from "@/components/billing/BillingCheckoutRefresh";
import { BuyCompanyCreditsButton } from "@/components/billing/BuyCompanyCreditsButton";
import { ConvertTrialNowButton } from "@/components/billing/ConvertTrialNowButton";
import { OpenCustomerPortalButton } from "@/components/billing/OpenCustomerPortalButton";
import { canOfferEarlyTrialConversion } from "@/lib/billing/end-trial-now";
import { getCompanyResearchCreditBalance } from "@/lib/billing/company-research-credits";
import { companyCreditBlockIsCheckoutReady } from "@/lib/billing/plans";
import { countActiveResearchedCompanies } from "@/lib/usage/active-companies";
import {
  ensureOrganizationPolicies,
  getEffectiveUsagePolicy,
} from "@/lib/usage/policy";

/** Always read live billing state — never serve a pre-checkout RSC snapshot. */
export const dynamic = "force-dynamic";

/**
 * Manage subscription only (portal, dates, capacity).
 * Unpaid self-serve → /onboarding/subscribe.
 */
export default async function OrganizationBillingSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organization, user } = await requireOrgAdmin();
  await ensureOrganizationPolicies(organization.id);
  const params = searchParams ? await searchParams : {};
  const checkoutState =
    typeof params.checkout === "string" ? params.checkout : null;
  const creditsState =
    typeof params.credits === "string" ? params.credits : null;

  const [billing, policy, activeCompanies, canConvertTrialEarly, creditBalance] =
    await Promise.all([
      prisma.organizationBillingProfile.findUnique({
        where: { organizationId: organization.id },
      }),
      getEffectiveUsagePolicy({
        organizationId: organization.id,
        userId: user.id,
      }),
      countActiveResearchedCompanies(organization.id),
      canOfferEarlyTrialConversion(organization.id),
      getCompanyResearchCreditBalance(organization.id),
    ]);

  if (billing && requiresStripeCheckout(billing)) {
    redirect(ONBOARDING_SUBSCRIBE_PATH);
  }

  const planCode = billing?.planCode ?? BILLING_PLAN_COMPED;
  const billingStatus = billing?.billingStatus ?? "FREE";
  const remaining = Math.max(
    0,
    policy.activeResearchedCompanyLimit +
      creditBalance.activeCreditCompanies -
      activeCompanies,
  );
  const effectiveLimit =
    policy.activeResearchedCompanyLimit + creditBalance.activeCreditCompanies;

  const isComped =
    planCode === BILLING_PLAN_COMPED ||
    planCode === "FREE" ||
    (billingStatus === "FREE" && !billing?.stripeCustomerId);

  const hasLiveSubscription =
    Boolean(billing?.stripeSubscriptionId) &&
    (billingStatus === "ACTIVE" ||
      billingStatus === "TRIALING" ||
      billingStatus === "PAST_DUE");

  const canOpenPortal = Boolean(billing?.stripeCustomerId);

  const creditsDisabledReason = !companyCreditBlockIsCheckoutReady()
    ? "Company credit packs are not configured yet."
    : !hasLiveSubscription
      ? "Subscribe to Standard before buying extra company capacity."
      : null;

  const discountActive = billing
    ? hasActiveDiscount({
        stripeDiscountPercentOff: billing.stripeDiscountPercentOff,
        stripeDiscountAmountOffCents: billing.stripeDiscountAmountOffCents,
        stripeEffectiveUnitAmountCents: billing.stripeEffectiveUnitAmountCents,
        stripePriceUnitAmountCents: billing.stripePriceUnitAmountCents,
      })
    : false;

  // Trial end date comes from the Stripe-synced billing profile — never from
  // BILLING_TRIAL_PERIOD_DAYS (env only affects NEW Checkout sessions).
  const trialSummary =
    billingStatus === "TRIALING"
      ? formatTrialEndsSummary({ trialEndsAt: billing?.trialEndsAt })
      : null;

  const showNextBilling =
    (billingStatus === "ACTIVE" || billingStatus === "PAST_DUE") &&
    Boolean(billing?.currentPeriodEnd);

  const catalogFloor = resolveEntitlementsForStatus({
    planCode,
    billingStatus,
  })?.activeResearchedCompanyLimit;

  const standardPaidFloor = getPlanDefinition(BILLING_PLAN_STANDARD)
    ?.entitlements.activeResearchedCompanyLimit;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <BillingCheckoutRefresh checkoutState={checkoutState} />
      <div>
        <Link
          href="/settings"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Billing
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Plan and status for{" "}
          <span className="font-medium text-slate-900">{organization.name}</span>
          . Signed in as {user.email}.
        </p>
      </div>

      {checkoutState === "success" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Checkout completed. Refreshing subscription status from Stripe…
        </p>
      ) : null}

      {creditsState === "success" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Credit purchase completed. Capacity updates when Stripe confirms
          (usually a few seconds) — refresh if the balance has not changed.
        </p>
      ) : null}

      <section
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-5"
        data-testid="billing-stripe-hook"
      >
        <h2 className="text-lg font-medium text-slate-900">Current plan</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Plan
            </dt>
            <dd className="mt-1 font-medium text-slate-900">
              {billingPlanLabel(planCode)}
            </dd>
            <p className="mt-1 text-sm text-slate-600">
              {billingPlanDescription({ planCode, billingStatus })}
            </p>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Status
            </dt>
            <dd className="mt-1 font-medium text-slate-900">
              {billingStatusLabel(billingStatus)}
            </dd>
          </div>
          {trialSummary ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Trial
              </dt>
              <dd className="mt-1 font-medium text-slate-900">{trialSummary}</dd>
            </div>
          ) : null}
          {showNextBilling ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Next billing date
              </dt>
              <dd className="mt-1 font-medium text-slate-900">
                {formatBillingDate(billing?.currentPeriodEnd)}
                {billing?.cancelAtPeriodEnd
                  ? " · cancels at period end"
                  : ""}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Billing contact
            </dt>
            <dd className="mt-1 font-medium text-slate-900">
              {billing?.billingEmail ?? "—"}
            </dd>
          </div>
          {billing?.stripePriceId ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Amount
              </dt>
              <dd className="mt-1 font-medium text-slate-900">
                {formatCustomerPayingAmount({
                  effectiveUnitAmountCents:
                    billing.stripeEffectiveUnitAmountCents,
                  listUnitAmountCents: billing.stripePriceUnitAmountCents,
                  currency: billing.stripePriceCurrency,
                  interval: billing.stripePriceInterval,
                })}
              </dd>
            </div>
          ) : null}
          {discountActive && billing ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Discount
              </dt>
              <dd className="mt-1 font-medium text-slate-900">
                {formatDiscountSummary({
                  percentOff: billing.stripeDiscountPercentOff,
                  amountOffCents: billing.stripeDiscountAmountOffCents,
                  currency: billing.stripePriceCurrency,
                  couponId: billing.stripeCouponId,
                })}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="text-sm text-slate-600">
          {isComped
            ? "This account is comped — no payment required. Card details stay in Stripe if you subscribe later."
            : "Card details stay in Stripe — never stored in this app."}
        </p>

        {hasLiveSubscription && canOpenPortal ? (
          <OpenCustomerPortalButton />
        ) : null}

        {isComped && !hasLiveSubscription ? (
          <p className="text-sm text-slate-600">
            <Link
              href={ONBOARDING_SUBSCRIBE_PATH}
              className="font-medium text-slate-900 underline"
            >
              Subscribe to Standard
            </Link>{" "}
            if you want to move this account onto a paid plan.
          </p>
        ) : null}
      </section>

      <section
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-5"
        data-testid="billing-research-capacity"
      >
        <h2 className="text-lg font-medium text-slate-900">
          Company research capacity
        </h2>
        <p className="text-sm text-slate-600">
          {activeCompanies} of {effectiveLimit} active researched companies used
          {remaining > 0
            ? ` — ${remaining} remaining.`
            : " — allowance used."}
          {creditBalance.activeCreditCompanies > 0
            ? ` Includes ${creditBalance.activeCreditCompanies} purchased credit companies` +
              (creditBalance.nextExpiresAt
                ? ` (next expiry ${formatBillingDate(creditBalance.nextExpiresAt)})`
                : "") +
              "."
            : ""}
        </p>
        {billingStatus === "TRIALING" && catalogFloor != null ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Trial allowance is {catalogFloor} companies
              {standardPaidFloor != null
                ? `; Standard is ${standardPaidFloor} after conversion`
                : ""}
              {policy.activeResearchedCompanyLimit > catalogFloor
                ? ` (your account currently shows ${policy.activeResearchedCompanyLimit} because a higher limit was kept from before Checkout)`
                : ""}
              .
            </p>
            {canConvertTrialEarly ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="mb-2 text-sm text-slate-700">
                  Need capacity before {trialSummary ?? "trial end"}? Convert
                  now — we charge your card today and start the Standard
                  billing cycle immediately (100 companies).
                </p>
                <ConvertTrialNowButton />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            One slot per distinct company with fresh research. Refreshing a
            company you already researched does not use another slot. Plan base
            is {policy.activeResearchedCompanyLimit}; credit packs stack on top
            for 12 months.
          </p>
        )}
        <BuyCompanyCreditsButton disabledReason={creditsDisabledReason} />
      </section>
    </div>
  );
}

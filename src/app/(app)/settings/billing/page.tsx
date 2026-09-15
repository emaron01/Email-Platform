import Link from "next/link";
import { redirect } from "next/navigation";
import {
  canManageOrganizationPolicy,
  getMembershipForCurrentUser,
} from "@/lib/org/authz";
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
  planUsesSeatBilling,
} from "@/lib/billing/plans";
import { loadEffectiveBillingCatalog } from "@/lib/billing/effective-catalog";
import { resolveCatalogEntitlementsForStatus } from "@/lib/billing/billing-catalog";
import {
  getOrganizationPaymentLockState,
  paymentLockUserMessage,
} from "@/lib/billing/payment-lock";
import { BillingCheckoutRefresh } from "@/components/billing/BillingCheckoutRefresh";
import { BuyCompanyCreditsButton } from "@/components/billing/BuyCompanyCreditsButton";
import { ConvertTrialNowButton } from "@/components/billing/ConvertTrialNowButton";
import { OpenCustomerPortalButton } from "@/components/billing/OpenCustomerPortalButton";
import { ReferralProgramPanel } from "@/components/billing/ReferralProgramPanel";
import { ResubscribeCheckoutButton } from "@/components/billing/ResubscribeCheckoutButton";
import { canOfferEarlyTrialConversion } from "@/lib/billing/end-trial-now";
import { getCompanyResearchCreditBalance } from "@/lib/billing/company-research-credits";
import { effectiveCreditsAreCheckoutReady } from "@/lib/billing/billing-prices";
import { loadEffectiveBillingPrices } from "@/lib/billing/effective-prices";
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
 * Payment-locked orgs land here for resubscribe only.
 */
export default async function OrganizationBillingSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organization, user, membership } = await getMembershipForCurrentUser();
  const isAdmin = canManageOrganizationPolicy(membership.role);
  await ensureOrganizationPolicies(organization.id);
  const params = searchParams ? await searchParams : {};
  const checkoutState =
    typeof params.checkout === "string" ? params.checkout : null;
  const creditsState =
    typeof params.credits === "string" ? params.credits : null;

  const [
    billing,
    policy,
    activeCompanies,
    canConvertTrialEarly,
    creditBalance,
    prices,
    catalogEffective,
    lockState,
    memberCount,
  ] = await Promise.all([
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
    loadEffectiveBillingPrices(),
    loadEffectiveBillingCatalog(),
    getOrganizationPaymentLockState(organization.id),
    prisma.organizationMembership.count({
      where: { organizationId: organization.id },
    }),
  ]);

  if (billing && requiresStripeCheckout(billing)) {
    redirect(ONBOARDING_SUBSCRIBE_PATH);
  }

  const paymentLocked = lockState.locked;
  const spendBlocked = lockState.spendBlocked;
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
  const showPortal =
    canOpenPortal && (hasLiveSubscription || paymentLocked || spendBlocked);
  const showResubscribe =
    paymentLocked && isAdmin && !hasLiveSubscription && !isComped;

  const creditsDisabledReason = !isAdmin
    ? "Only an organization admin can buy credits."
    : !effectiveCreditsAreCheckoutReady(prices)
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

  // Trial allowance = what this org actually has stored.
  const trialAllowance = policy.activeResearchedCompanyLimit;

  // Paid Standard floor = live billing.catalog, else plans.ts.
  const standardPaidFromCatalog = resolveCatalogEntitlementsForStatus({
    catalog: catalogEffective.catalog,
    planCode: BILLING_PLAN_STANDARD,
    billingStatus: "ACTIVE",
  })?.activeResearchedCompanyLimit;
  const standardPaidFloor =
    standardPaidFromCatalog ??
    getPlanDefinition(BILLING_PLAN_STANDARD)?.entitlements
      .activeResearchedCompanyLimit ??
    null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <BillingCheckoutRefresh checkoutState={checkoutState} />
      <div>
        {paymentLocked ? null : (
          <Link
            href="/settings"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Settings
          </Link>
        )}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Billing
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Plan and status for{" "}
          <span className="font-medium text-slate-900">{organization.name}</span>
          . Signed in as {user.email}.
        </p>
      </div>

      {spendBlocked && lockState.profile ? (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          data-testid="billing-payment-lock-banner"
        >
          <p className="font-medium">
            {paymentLockUserMessage(lockState.profile)}
          </p>
          {billingStatus === "CANCELED" ? (
            <>
              <p>
                For 30 days from cancellation
                {billing?.canceledAt
                  ? ` (${formatBillingDate(billing.canceledAt)})`
                  : ""}
                , we keep your contact lists, research, scores, campaigns,
                drafts, send history, and{" "}
                <span className="font-medium">opt-out / suppression list</span>.
                Resubscribe in that window and all of it unlocks with this
                workspace.
              </p>
              <p>
                After 30 days we permanently delete that contact and outbound
                data — including suppressions. Your account, products, ICPs,
                personas, voice, signature, billing, and credit packs stay so you
                can return and rebuild lists.
              </p>
            </>
          ) : billingStatus === "PAST_DUE" && !paymentLocked ? (
            <p>
              You can still open campaigns, contacts, and setup. Research, email
              generation, and sending stay off until payment succeeds. Stripe may
              retry the charge automatically; you can also update your card in
              the billing portal.
              {billing?.gracePeriodEndsAt
                ? ` If payment is still unpaid after ${formatBillingDate(billing.gracePeriodEndsAt)}, access narrows to this billing page only.`
                : ""}
            </p>
          ) : (
            <p>
              Your products, ICPs, personas, and account stay on this workspace.
              Resubscribe or update payment to unlock the product again.
            </p>
          )}
          {!isAdmin ? (
            <p>
              Ask an organization admin to update billing — members cannot start
              Checkout.
            </p>
          ) : null}
        </div>
      ) : null}

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
              {billingPlanDescription({
                planCode,
                billingStatus,
                activeResearchedCompanyLimit:
                  policy.activeResearchedCompanyLimit,
                dailyEmailSendWarningLimit: policy.dailyEmailSendWarningLimit,
                monthlyEmailSendLimit: policy.monthlyEmailSendLimit,
                seatQuantity: billing?.seatQuantity,
                maxSeats: billing?.maxSeats,
                usedSeats: memberCount,
                companiesPerSeat: planUsesSeatBilling(planCode)
                  ? policy.activeResearchedCompanyLimit
                  : null,
              })}
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

        {showResubscribe ? <ResubscribeCheckoutButton /> : null}

        {showPortal && isAdmin ? <OpenCustomerPortalButton /> : null}
        {showPortal && !isAdmin ? (
          <p className="text-sm text-slate-600">
            An organization admin can open Stripe to update the card or
            resubscribe.
          </p>
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

      {paymentLocked ? null : <ReferralProgramPanel />}

      {paymentLocked ? null : (
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
        {billingStatus === "TRIALING" && trialAllowance != null ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Trial allowance is {trialAllowance} companies
              {standardPaidFloor != null
                ? `; Standard is ${standardPaidFloor} after conversion`
                : ""}
              .
            </p>
            {canConvertTrialEarly && isAdmin ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="mb-2 text-sm text-slate-700">
                  Need capacity before {trialSummary ?? "trial end"}? Convert
                  now — we charge your card today and start the Standard
                  billing cycle immediately
                  {standardPaidFloor != null
                    ? ` (${standardPaidFloor} companies)`
                    : ""}
                  .
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
      )}
    </div>
  );
}

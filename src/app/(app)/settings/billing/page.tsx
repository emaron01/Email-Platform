import Link from "next/link";
import { requireOrgAdmin } from "@/lib/org/authz";
import { prisma } from "@/lib/prisma";
import {
  BILLING_PLAN_COMPED,
  billingPlanLabel,
  billingStatusLabel,
  formatCustomerPayingAmount,
  formatDiscountSummary,
  requiresStripeCheckout,
} from "@/lib/billing/billing-state";
import { hasActiveDiscount } from "@/lib/billing/price-discount-mirror";
import {
  BILLING_PLAN_STANDARD,
  planIsCheckoutReady,
} from "@/lib/billing/plans";
import { stripeConfigured } from "@/lib/billing/stripe";
import { BillingCheckoutRefresh } from "@/components/billing/BillingCheckoutRefresh";
import { StartStandardCheckoutButton } from "@/components/billing/StartStandardCheckoutButton";
import { countActiveResearchedCompanies } from "@/lib/usage/active-companies";
import {
  ensureOrganizationPolicies,
  getEffectiveUsagePolicy,
} from "@/lib/usage/policy";

/** Always read live billing state — never serve a pre-checkout RSC snapshot. */
export const dynamic = "force-dynamic";

/**
 * Org billing settings — Checkout for UNPAID / optional subscribe for COMPED.
 * OWNER/ADMIN only.
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

  const [billing, policy, activeCompanies] = await Promise.all([
    prisma.organizationBillingProfile.findUnique({
      where: { organizationId: organization.id },
    }),
    getEffectiveUsagePolicy({
      organizationId: organization.id,
      userId: user.id,
    }),
    countActiveResearchedCompanies(organization.id),
  ]);

  const planCode = billing?.planCode ?? BILLING_PLAN_COMPED;
  const billingStatus = billing?.billingStatus ?? "FREE";
  const remaining = Math.max(
    0,
    policy.activeResearchedCompanyLimit - activeCompanies,
  );

  const isComped =
    planCode === BILLING_PLAN_COMPED ||
    planCode === "FREE" ||
    (billingStatus === "FREE" && !billing?.stripeSubscriptionId);
  const needsCheckout = billing ? requiresStripeCheckout(billing) : false;

  const hasLiveSubscription =
    Boolean(billing?.stripeSubscriptionId) &&
    (billingStatus === "ACTIVE" ||
      billingStatus === "TRIALING" ||
      billingStatus === "PAST_DUE");

  let checkoutDisabled: string | null = null;
  if (!stripeConfigured() || !planIsCheckoutReady(BILLING_PLAN_STANDARD)) {
    checkoutDisabled =
      "Stripe Checkout is not configured yet (set STRIPE_SECRET_KEY and STRIPE_PRICE_STANDARD_MONTHLY).";
  } else if (hasLiveSubscription) {
    checkoutDisabled =
      "Subscription is active. Customer Portal for self-serve billing changes is next.";
  }

  const discountActive = billing
    ? hasActiveDiscount({
        stripeDiscountPercentOff: billing.stripeDiscountPercentOff,
        stripeDiscountAmountOffCents: billing.stripeDiscountAmountOffCents,
        stripeEffectiveUnitAmountCents: billing.stripeEffectiveUnitAmountCents,
        stripePriceUnitAmountCents: billing.stripePriceUnitAmountCents,
      })
    : false;

  const checkoutButtonLabel = isComped
    ? "Subscribe to Standard"
    : needsCheckout
      ? "Start Standard trial"
      : "Start Standard trial";

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
        <p className="mt-1 font-mono text-xs text-slate-500">
          {planCode} / {billingStatus}
          {billing?.stripeSubscriptionId
            ? ` · ${billing.stripeSubscriptionId}`
            : " · no subscription id"}
        </p>
      </div>

      {checkoutState === "required" ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Start your 7-day Standard trial to use the product. Card required —
          you can enter a promotion code on the next screen.
        </p>
      ) : null}
      {checkoutState === "success" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Checkout completed. Refreshing subscription status from Stripe…
        </p>
      ) : null}
      {checkoutState === "canceled" ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Checkout canceled — no charge was made. You can resume anytime from
          this page.
        </p>
      ) : null}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-medium text-slate-900">Current plan</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Plan
            </dt>
            <dd className="mt-1 font-medium text-slate-900">
              {billingPlanLabel(planCode)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Status
            </dt>
            <dd className="mt-1 font-medium text-slate-900">
              {billingStatusLabel(billingStatus)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Account type
            </dt>
            <dd className="mt-1 font-medium text-slate-900">
              {organization.accountType}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Billing contact email
            </dt>
            <dd className="mt-1 font-medium text-slate-900">
              {billing?.billingEmail ?? "—"}
            </dd>
          </div>
          {billing?.stripePriceId ? (
            <>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Paying
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
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Discount
                </dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {discountActive
                    ? formatDiscountSummary({
                        percentOff: billing.stripeDiscountPercentOff,
                        amountOffCents: billing.stripeDiscountAmountOffCents,
                        currency: billing.stripePriceCurrency,
                        couponId: billing.stripeCouponId,
                      })
                    : "None"}
                </dd>
              </div>
            </>
          ) : null}
        </dl>
        <p className="text-sm text-slate-600">
          {isComped
            ? "This account is comped — no payment required. You can optionally subscribe to Standard below; raised company limits you already have are kept."
            : "No card numbers, billing addresses, or tax IDs are stored in this app — Stripe hosts payment collection."}
        </p>
        <StartStandardCheckoutButton
          disabledReason={checkoutDisabled}
          buttonLabel={checkoutButtonLabel}
        />
      </section>

      <section
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-5"
        data-testid="billing-research-capacity"
      >
        <h2 className="text-lg font-medium text-slate-900">
          Company research capacity
        </h2>
        <p className="text-sm text-slate-600">
          {activeCompanies} of {policy.activeResearchedCompanyLimit} active
          researched companies used
          {remaining > 0
            ? ` — ${remaining} remaining.`
            : " — allowance used."}
        </p>
        <p className="text-sm text-slate-600">
          Trial includes 25 companies; Standard includes 100 after conversion.
          One slot per distinct company with fresh research.
        </p>
      </section>
    </div>
  );
}

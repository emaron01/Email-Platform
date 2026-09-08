import Link from "next/link";
import { requireOrgAdmin } from "@/lib/org/authz";
import { prisma } from "@/lib/prisma";
import {
  billingPlanLabel,
  billingStatusLabel,
  formatCustomerPayingAmount,
  formatDiscountSummary,
} from "@/lib/billing/billing-state";
import { hasActiveDiscount } from "@/lib/billing/price-discount-mirror";
import {
  BILLING_PLAN_STANDARD,
  planIsCheckoutReady,
} from "@/lib/billing/plans";
import { stripeConfigured } from "@/lib/billing/stripe";
import { StartStandardCheckoutButton } from "@/components/billing/StartStandardCheckoutButton";
import { countActiveResearchedCompanies } from "@/lib/usage/active-companies";
import {
  ensureOrganizationPolicies,
  getEffectiveUsagePolicy,
} from "@/lib/usage/policy";

/**
 * Org billing settings — plan/status + Stripe Checkout for STANDARD.
 * OWNER/ADMIN only (requireOrgAdmin). MEMBER cannot open this page.
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

  const planCode = billing?.planCode ?? "FREE";
  const billingStatus = billing?.billingStatus ?? "FREE";
  const remaining = Math.max(
    0,
    policy.activeResearchedCompanyLimit - activeCompanies,
  );

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

  return (
    <div className="mx-auto max-w-3xl space-y-8">
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
          Plan and status for {organization.name}. Signed in as {user.email}.
        </p>
      </div>

      {checkoutState === "success" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Checkout completed. Subscription status updates when Stripe confirms
          the webhook.
        </p>
      ) : null}
      {checkoutState === "canceled" ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Checkout canceled — no charge was made.
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
          No card numbers, billing addresses, or tax IDs are stored in this app
          — Stripe hosts payment collection.
        </p>
        <StartStandardCheckoutButton disabledReason={checkoutDisabled} />
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
          One slot per distinct company with fresh research. Refreshing a
          company you already researched does not use another slot.
        </p>
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
          <p className="font-medium text-slate-800">Add capacity</p>
          <p className="mt-1">
            Purchasing additional company research credits will appear here in a
            later billing phase. Until then, ask a platform admin to raise the
            organization limit in the platform console.
          </p>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { requireOrgAdmin } from "@/lib/org/authz";
import { prisma } from "@/lib/prisma";
import {
  billingPlanLabel,
  billingStatusLabel,
} from "@/lib/billing/billing-state";

/**
 * Org billing settings — plan/status visible now; Stripe portal/checkout in Phase C.
 * OWNER/ADMIN only (requireOrgAdmin). MEMBER cannot open this page.
 */
export default async function OrganizationBillingSettingsPage() {
  const { organization, user } = await requireOrgAdmin();

  const billing = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId: organization.id },
  });

  const planCode = billing?.planCode ?? "FREE";
  const billingStatus = billing?.billingStatus ?? "FREE";

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
        </dl>
        <p className="text-sm text-slate-600">
          This account is free. Payment management will appear here when Stripe
          is connected — no card data is stored in this app.
        </p>
        {/* Phase C: Stripe Customer Portal / Checkout buttons mount here. */}
        <div
          data-testid="billing-stripe-hook"
          className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500"
        >
          Stripe portal and checkout hooks reserved for Phase C (
          <code className="text-[11px]">/api/billing/portal</code>,{" "}
          <code className="text-[11px]">/api/billing/checkout</code>).
        </div>
      </section>
    </div>
  );
}

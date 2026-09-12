import Link from "next/link";
import { requirePlatformSuperAdmin } from "@/lib/auth/authz";
import { PLATFORM_SETTING_BILLING_CATALOG } from "@/lib/billing/billing-catalog";
import {
  ensureBillingCatalogSeeded,
  loadEffectiveBillingCatalog,
} from "@/lib/billing/effective-catalog";
import { fetchSellableCatalogPrices } from "@/lib/billing/fetch-catalog-prices";
import { loadEffectiveBillingPrices } from "@/lib/billing/effective-prices";
import { BILLING_PLAN_STANDARD } from "@/lib/billing/plans";
import { hasPlatformSetting } from "@/lib/platform/settings";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { formatStripeMoney } from "@/lib/billing/billing-state";
import { BillingCatalogSettingsForm } from "@/components/platform/BillingCatalogSettingsForm";

export default async function PlatformCatalogPage() {
  const user = await requirePlatformSuperAdmin();
  await ensureBillingCatalogSeeded(user.id);

  const [effective, hasRow, priceCatalog, prices] = await Promise.all([
    loadEffectiveBillingCatalog(),
    hasPlatformSetting(PLATFORM_SETTING_BILLING_CATALOG),
    fetchSellableCatalogPrices(),
    loadEffectiveBillingPrices(),
  ]);

  const standardPrice =
    priceCatalog.plans.find((p) => p.planCode === BILLING_PLAN_STANDARD) ??
    null;

  let creditsPriceLabel: string | null = null;
  const creditsPriceId = prices.companyCreditsPriceId.value;
  if (stripeConfigured() && creditsPriceId) {
    try {
      const price = await getStripe().prices.retrieve(creditsPriceId);
      if (price.unit_amount != null && price.currency) {
        creditsPriceLabel = `${formatStripeMoney(price.unit_amount, price.currency)} / block`;
      }
    } catch {
      creditsPriceLabel = null;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/platform" className="underline">
            Platform
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Product catalog
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Marketing copy and entitlement floors for new Checkout. Existing
          subscribers keep their stored org policies. SUPER_ADMIN only.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <BillingCatalogSettingsForm
          plans={effective.catalog.plans}
          sourceLabel={effective.sourceLabel}
          hasConsoleRow={hasRow}
          standardPriceLabel={standardPrice?.priceLabel ?? null}
          creditsPriceLabel={creditsPriceLabel}
        />
      </section>
    </div>
  );
}

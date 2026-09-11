import Link from "next/link";
import { requirePlatformSuperAdmin } from "@/lib/auth/authz";
import { BILLING_PLAN_STANDARD } from "@/lib/billing/plans";
import {
  PLATFORM_SETTING_BILLING_TRIAL,
  resolveEffectiveTrialPeriod,
} from "@/lib/billing/trial-period";
import {
  getBillingTrialPlatformSetting,
  hasPlatformSetting,
} from "@/lib/platform/settings";
import { BillingTrialSettingsForm } from "@/components/platform/BillingTrialSettingsForm";

export default async function PlatformBillingPage() {
  await requirePlatformSuperAdmin();

  const [platformSetting, hasConsoleRow] = await Promise.all([
    getBillingTrialPlatformSetting(),
    hasPlatformSetting(PLATFORM_SETTING_BILLING_TRIAL),
  ]);
  const effective = resolveEffectiveTrialPeriod({
    planCode: BILLING_PLAN_STANDARD,
    platformSetting,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/platform" className="underline">
            Platform
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Billing settings
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Trial length for new Standard Checkout sessions. SUPER_ADMIN only.
          Existing trials are not changed.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-medium text-slate-900">Free trial</h2>
        <p className="mt-1 text-sm text-slate-600">
          Global default for all sellable plans. Per-plan overrides can be
          stored in the same setting later without a schema change.
        </p>
        <div className="mt-4">
          <BillingTrialSettingsForm
            consoleEnabled={platformSetting?.enabled ?? null}
            consoleDays={platformSetting?.days ?? null}
            hasConsoleRow={hasConsoleRow}
            effectiveDays={effective.days}
            sourceLabel={effective.sourceLabel}
          />
        </div>
      </section>
    </div>
  );
}

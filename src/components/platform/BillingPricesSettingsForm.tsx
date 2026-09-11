"use client";

import { useActionState } from "react";
import {
  updateBillingPricesSettingAction,
  type PlatformSettingsActionResult,
} from "@/app/actions/platform-settings";
import { PrimaryButton, SecondaryButton } from "@/components/ui";

const initial: PlatformSettingsActionResult | null = null;

type FieldView = {
  value: string | null;
  sourceLabel: string;
};

export function BillingPricesSettingsForm({
  consoleStandardMonthlyPriceId,
  consoleStandardProductId,
  consoleCompanyCreditsPriceId,
  hasConsoleRow,
  effective,
}: {
  consoleStandardMonthlyPriceId: string | null;
  consoleStandardProductId: string | null;
  consoleCompanyCreditsPriceId: string | null;
  hasConsoleRow: boolean;
  effective: {
    standardMonthlyPriceId: FieldView;
    standardProductId: FieldView;
    companyCreditsPriceId: FieldView;
  };
}) {
  const [state, formAction, pending] = useActionState(
    updateBillingPricesSettingAction,
    initial,
  );

  return (
    <div className="space-y-4" data-testid="billing-prices-settings">
      <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
        <p className="font-medium">Effective Stripe IDs (new Checkout)</p>
        <ul className="space-y-1 text-slate-700">
          <li>
            <span className="font-medium">Standard monthly price:</span>{" "}
            <code className="break-all text-xs">
              {effective.standardMonthlyPriceId.value ?? "—"}
            </code>
            <span className="mt-0.5 block text-xs text-slate-500">
              Source: {effective.standardMonthlyPriceId.sourceLabel}
              {hasConsoleRow ? "" : " (no console override)"}
            </span>
          </li>
          <li>
            <span className="font-medium">Standard product:</span>{" "}
            <code className="break-all text-xs">
              {effective.standardProductId.value ?? "—"}
            </code>
            <span className="mt-0.5 block text-xs text-slate-500">
              Source: {effective.standardProductId.sourceLabel}
              {hasConsoleRow ? "" : " (no console override)"}
            </span>
          </li>
          <li>
            <span className="font-medium">Company credits price:</span>{" "}
            <code className="break-all text-xs">
              {effective.companyCreditsPriceId.value ?? "—"}
            </code>
            <span className="mt-0.5 block text-xs text-slate-500">
              Source: {effective.companyCreditsPriceId.sourceLabel}
              {hasConsoleRow ? "" : " (no console override)"}
            </span>
          </li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Changes apply only to new Checkout sessions. Existing subscribers keep
          the Price already stored on their Stripe subscription.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="intent" value="save" />
        <label className="block text-sm">
          <span className="font-medium text-slate-800">
            Standard monthly price ID
          </span>
          <input
            type="text"
            name="standardMonthlyPriceId"
            required
            spellCheck={false}
            defaultValue={
              consoleStandardMonthlyPriceId ??
              effective.standardMonthlyPriceId.value ??
              ""
            }
            placeholder="price_…"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-800">
            Standard product ID
          </span>
          <input
            type="text"
            name="standardProductId"
            required
            spellCheck={false}
            defaultValue={
              consoleStandardProductId ??
              effective.standardProductId.value ??
              ""
            }
            placeholder="prod_…"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Referral coupons scope to this product via applies_to.
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-800">
            Company credits price ID
          </span>
          <input
            type="text"
            name="companyCreditsPriceId"
            required
            spellCheck={false}
            defaultValue={
              consoleCompanyCreditsPriceId ??
              effective.companyCreditsPriceId.value ??
              ""
            }
            placeholder="price_…"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
          />
        </label>

        {state ? (
          <p
            role="status"
            data-testid="billing-prices-settings-status"
            className={
              state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"
            }
          >
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? "Validating with Stripe…" : "Save price IDs"}
          </PrimaryButton>
        </div>
      </form>

      {hasConsoleRow ? (
        <form action={formAction}>
          <input type="hidden" name="intent" value="clear" />
          <SecondaryButton type="submit" disabled={pending}>
            Clear console override (use environment)
          </SecondaryButton>
        </form>
      ) : null}
    </div>
  );
}

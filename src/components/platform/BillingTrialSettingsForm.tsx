"use client";

import { useActionState } from "react";
import {
  updateBillingTrialSettingAction,
  type PlatformSettingsActionResult,
} from "@/app/actions/platform-settings";
import {
  MAX_TRIAL_PERIOD_DAYS,
  MIN_TRIAL_PERIOD_DAYS,
} from "@/lib/billing/trial-period";
import { PrimaryButton, SecondaryButton } from "@/components/ui";

const initial: PlatformSettingsActionResult | null = null;

export function BillingTrialSettingsForm({
  consoleEnabled,
  consoleDays,
  hasConsoleRow,
  effectiveDays,
  sourceLabel,
}: {
  /** Current console row (null fields when no row). */
  consoleEnabled: boolean | null;
  consoleDays: number | null;
  hasConsoleRow: boolean;
  effectiveDays: number | null;
  sourceLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateBillingTrialSettingAction,
    initial,
  );

  const defaultEnabled = consoleEnabled ?? true;
  const defaultDays =
    consoleDays ??
    (effectiveDays != null && effectiveDays > 0 ? effectiveDays : 7);

  const effectiveLabel =
    effectiveDays == null
      ? "Trial off for new Checkout"
      : `${effectiveDays}-day trial on new Checkout`;

  return (
    <div className="space-y-4" data-testid="billing-trial-settings">
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
        <p className="font-medium">{effectiveLabel}</p>
        <p className="mt-0.5 text-slate-600">
          Source: {sourceLabel}
          {hasConsoleRow ? "" : " (no console override)"}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Changes apply only to new Checkout sessions. Orgs already on a trial
          keep their Stripe trial end date.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="intent" value="save" />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-800">
            Trial for new Standard Checkout
          </legend>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name="enabled"
              value="1"
              defaultChecked={defaultEnabled}
            />
            On
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name="enabled"
              value="0"
              defaultChecked={!defaultEnabled}
            />
            Off
          </label>
        </fieldset>

        <label className="block text-sm">
          <span className="font-medium text-slate-800">Duration (days)</span>
          <input
            type="number"
            name="days"
            min={MIN_TRIAL_PERIOD_DAYS}
            max={MAX_TRIAL_PERIOD_DAYS}
            defaultValue={defaultDays}
            className="mt-1 w-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Required when trial is on ({MIN_TRIAL_PERIOD_DAYS}–
            {MAX_TRIAL_PERIOD_DAYS}).
          </span>
        </label>

        {state ? (
          <p
            role="status"
            data-testid="billing-trial-settings-status"
            className={
              state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"
            }
          >
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save trial setting"}
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

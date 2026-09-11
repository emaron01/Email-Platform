"use server";

import { revalidatePath } from "next/cache";
import {
  AuthorizationError,
  requirePlatformSuperAdmin,
} from "@/lib/auth/authz";
import {
  buildBillingPricesSetting,
  PLATFORM_SETTING_BILLING_PRICES,
} from "@/lib/billing/billing-prices";
import { validateBillingPricesAgainstStripe } from "@/lib/billing/validate-billing-prices";
import {
  buildBillingTrialSetting,
  MAX_TRIAL_PERIOD_DAYS,
  MIN_TRIAL_PERIOD_DAYS,
  PLATFORM_SETTING_BILLING_TRIAL,
} from "@/lib/billing/trial-period";
import {
  deletePlatformSetting,
  getBillingTrialPlatformSetting,
  upsertBillingPricesSetting,
  upsertBillingTrialSetting,
} from "@/lib/platform/settings";
import { TenantError } from "@/lib/tenant/errors";

export type PlatformSettingsActionResult = {
  ok: boolean;
  message: string;
};

function toSafeError(error: unknown): string {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof TenantError) return error.message;
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (
      lower.includes("prisma") ||
      error.message.includes("\n") ||
      error.message.length > 240
    ) {
      return "Unable to save platform setting. Please try again.";
    }
    return error.message;
  }
  return "Unable to save platform setting. Please try again.";
}

function revalidateBillingConsole(): void {
  revalidatePath("/platform");
  revalidatePath("/platform/billing");
}

export async function updateBillingTrialSettingAction(
  _prev: PlatformSettingsActionResult | null,
  formData: FormData,
): Promise<PlatformSettingsActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const intent = String(formData.get("intent") || "save").trim();

    if (intent === "clear") {
      await deletePlatformSetting({
        key: PLATFORM_SETTING_BILLING_TRIAL,
        actorUserId: user.id,
      });
      revalidateBillingConsole();
      return {
        ok: true,
        message:
          "Console trial setting cleared. Environment fallback is in effect.",
      };
    }

    const enabledRaw = String(formData.get("enabled") || "").trim();
    const enabled = enabledRaw === "1" || enabledRaw.toLowerCase() === "on";
    const daysRaw = String(formData.get("days") || "").trim();
    const days = Number.parseInt(daysRaw, 10);

    if (enabled) {
      if (
        !Number.isInteger(days) ||
        days < MIN_TRIAL_PERIOD_DAYS ||
        days > MAX_TRIAL_PERIOD_DAYS
      ) {
        return {
          ok: false,
          message: `When trial is on, days must be an integer from ${MIN_TRIAL_PERIOD_DAYS} to ${MAX_TRIAL_PERIOD_DAYS}.`,
        };
      }
    }

    const existing = await getBillingTrialPlatformSetting();
    const value = buildBillingTrialSetting({
      enabled,
      days: enabled ? days : MIN_TRIAL_PERIOD_DAYS,
      existingByPlan: existing?.byPlan,
    });

    await upsertBillingTrialSetting({
      value,
      actorUserId: user.id,
    });
    revalidateBillingConsole();
    return {
      ok: true,
      message: enabled
        ? `Trial set to ${days} days for new Checkout sessions.`
        : "Trial turned off for new Checkout sessions.",
    };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function updateBillingPricesSettingAction(
  _prev: PlatformSettingsActionResult | null,
  formData: FormData,
): Promise<PlatformSettingsActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const intent = String(formData.get("intent") || "save").trim();

    if (intent === "clear") {
      await deletePlatformSetting({
        key: PLATFORM_SETTING_BILLING_PRICES,
        actorUserId: user.id,
      });
      revalidateBillingConsole();
      return {
        ok: true,
        message:
          "Console price IDs cleared. Environment fallback is in effect.",
      };
    }

    let value;
    try {
      value = buildBillingPricesSetting({
        standardMonthlyPriceId: String(
          formData.get("standardMonthlyPriceId") || "",
        ),
        standardProductId: String(formData.get("standardProductId") || ""),
        companyCreditsPriceId: String(
          formData.get("companyCreditsPriceId") || "",
        ),
      });
    } catch (error) {
      return { ok: false, message: toSafeError(error) };
    }

    await validateBillingPricesAgainstStripe(value);
    await upsertBillingPricesSetting({
      value,
      actorUserId: user.id,
    });
    revalidateBillingConsole();
    return {
      ok: true,
      message:
        "Price IDs verified with Stripe and saved for new Checkout sessions.",
    };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

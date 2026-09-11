"use server";

import { revalidatePath } from "next/cache";
import {
  AuthorizationError,
  requirePlatformSuperAdmin,
} from "@/lib/auth/authz";
import {
  buildBillingTrialSetting,
  MAX_TRIAL_PERIOD_DAYS,
  MIN_TRIAL_PERIOD_DAYS,
  PLATFORM_SETTING_BILLING_TRIAL,
} from "@/lib/billing/trial-period";
import {
  deletePlatformSetting,
  getBillingTrialPlatformSetting,
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
      revalidatePath("/platform");
      return {
        ok: true,
        message: "Console trial setting cleared. Environment fallback is in effect.",
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
    revalidatePath("/platform");
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

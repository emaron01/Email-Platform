"use server";

import { revalidatePath } from "next/cache";
import {
  addContactsToCampaign,
  addScoringRunContactsToCampaign,
} from "@/lib/campaign/contacts";
import { TenantError } from "@/lib/tenant/errors";

export type CampaignContactsActionResult = {
  ok: boolean;
  message: string;
  addedCount?: number;
};

function campaignIdFrom(formData: FormData): string {
  return String(formData.get("campaignId") ?? "").trim();
}

function revalidateCampaign(campaignId: string): void {
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
}

function toSafeCampaignContactsError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  return "Unable to add contacts to this campaign. Please try again.";
}

export async function addContactsToCampaignAction(
  _prev: CampaignContactsActionResult | null,
  formData: FormData,
): Promise<CampaignContactsActionResult> {
  const campaignId = campaignIdFrom(formData);
  if (!campaignId) return { ok: false, message: "Campaign is required." };

  try {
    const addedCount = await addContactsToCampaign({
      campaignId,
      contactIds: formData
        .getAll("contactIds")
        .map((value) => String(value).trim())
        .filter(Boolean),
    });
    revalidateCampaign(campaignId);
    return {
      ok: true,
      message:
        addedCount === 0
          ? "All selected contacts are already attached."
          : `${addedCount} contact${addedCount === 1 ? "" : "s"} added.`,
      addedCount,
    };
  } catch (error) {
    console.error("Failed to add campaign contacts.", error);
    return { ok: false, message: toSafeCampaignContactsError(error) };
  }
}

export async function addScoringRunContactsToCampaignAction(
  _prev: CampaignContactsActionResult | null,
  formData: FormData,
): Promise<CampaignContactsActionResult> {
  const campaignId = campaignIdFrom(formData);
  const scoringRunId = String(formData.get("scoringRunId") ?? "").trim();
  if (!campaignId) return { ok: false, message: "Campaign is required." };
  if (!scoringRunId) {
    return { ok: false, message: "Select a scoring run." };
  }

  try {
    const addedCount = await addScoringRunContactsToCampaign({
      campaignId,
      scoringRunId,
    });
    revalidateCampaign(campaignId);
    return {
      ok: true,
      message:
        addedCount === 0
          ? "All scored contacts are already attached."
          : `${addedCount} scored contact${addedCount === 1 ? "" : "s"} added.`,
      addedCount,
    };
  } catch (error) {
    console.error("Failed to add scored campaign contacts.", error);
    return { ok: false, message: toSafeCampaignContactsError(error) };
  }
}

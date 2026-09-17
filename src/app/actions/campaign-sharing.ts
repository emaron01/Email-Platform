"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { createCampaignExecution } from "@/lib/campaign/execution";
import { duplicateSharedCampaign } from "@/lib/campaign/duplicate";
import {
  canEditCampaignTemplate,
  canSetCampaignShared,
} from "@/lib/campaign/visibility";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";

export type CampaignActionResult = { ok: boolean; message: string };
/** Alias for CampaignVisibilityForm. */
export type CampaignSharingActionResult = CampaignActionResult;

export async function useSharedCampaignAction(
  formData: FormData,
): Promise<CampaignActionResult> {
  const { organization, user } = await getMembershipForCurrentUser();
  const campaignId = String(formData.get("campaignId") || "").trim();
  if (!campaignId) throw new TenantError("Campaign is required.");

  const { executionId } = await createCampaignExecution({
    organizationId: organization.id,
    campaignId,
    userId: user.id,
  });
  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaignId}?execution=${executionId}`);
}

/**
 * Copy SHARED campaign config into a new PERSONAL campaign owned by the actor.
 */
export async function duplicateSharedCampaignAction(
  formData: FormData,
): Promise<CampaignActionResult> {
  const { organization, user, membership } =
    await getMembershipForCurrentUser();
  const campaignId = String(formData.get("campaignId") || "").trim();
  if (!campaignId) throw new TenantError("Campaign is required.");

  const { campaignId: newId } = await duplicateSharedCampaign({
    organizationId: organization.id,
    sourceCampaignId: campaignId,
    actorUserId: user.id,
    actorRole: membership.role,
  });
  revalidatePath("/campaigns");
  redirect(`/campaigns/${newId}`);
}

export async function setCampaignVisibilityAction(
  _prev: CampaignActionResult | null,
  formData: FormData,
): Promise<CampaignActionResult> {
  try {
    const { organization, user, membership } =
      await getMembershipForCurrentUser();
    if (!canSetCampaignShared(membership.role)) {
      return {
        ok: false,
        message: "Only organization admins can share campaigns.",
      };
    }
    const campaignId = String(formData.get("campaignId") || "").trim();
    const visibilityRaw = String(formData.get("visibility") || "").trim();
    const visibility =
      visibilityRaw === "SHARED" ? "SHARED" : ("PERSONAL" as const);

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: organization.id },
      select: { ownerUserId: true, visibility: true },
    });
    if (!campaign) return { ok: false, message: "Campaign not found." };
    if (
      !canEditCampaignTemplate({
        role: membership.role,
        userId: user.id,
        campaign,
      })
    ) {
      return { ok: false, message: "You cannot change this campaign." };
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        visibility,
        ownerUserId: campaign.ownerUserId ?? user.id,
      },
    });
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return {
      ok: true,
      message:
        visibility === "SHARED"
          ? "Campaign is shared. Teammates can Use this campaign (run on the template) or Duplicate as mine (personal copy)."
          : "Campaign is personal again.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to update visibility.",
    };
  }
}

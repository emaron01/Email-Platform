"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/authz";
import {
  validateCampaignOffer,
  type CampaignOfferFields,
  type OfferConflict,
} from "@/lib/campaign/offer-validation";
import {
  getCampaignOfferValidationTarget,
  updateCampaignOffer,
} from "@/lib/campaign/settings";
import { TenantError } from "@/lib/tenant/errors";

export type CampaignOfferActionResult = {
  ok: boolean;
  message: string;
  values?: CampaignOfferFields;
  offerConflicts?: OfferConflict[];
  requiresOfferAcknowledgment?: boolean;
  semanticValidationCompleted?: boolean;
};

function readOffer(formData: FormData): CampaignOfferFields {
  const value = (key: string) => String(formData.get(key) ?? "").trim() || null;
  return {
    offerName: value("offerName"),
    offerDescription: value("offerDescription"),
    offerCta: value("offerCta"),
    offerNotes: value("offerNotes"),
  };
}

export async function updateCampaignOfferAction(
  _previous: CampaignOfferActionResult | null,
  formData: FormData,
): Promise<CampaignOfferActionResult> {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const values = readOffer(formData);
  const acknowledged =
    String(formData.get("acknowledgeOfferConflicts") ?? "") === "1";
  if (!campaignId) {
    return { ok: false, message: "Campaign is required.", values };
  }

  try {
    const [campaign, user] = await Promise.all([
      getCampaignOfferValidationTarget(campaignId),
      requireCurrentUser(),
    ]);
    const validation = await validateCampaignOffer({
      organizationId: campaign.organizationId,
      userId: user.id,
      productId: campaign.productId,
      personaId: campaign.personaId,
      offer: values,
    });
    if (validation.conflicts.length > 0 && !acknowledged) {
      return {
        ok: false,
        message: "Review the offer conflicts before saving.",
        values,
        offerConflicts: validation.conflicts,
        requiresOfferAcknowledgment: true,
        semanticValidationCompleted: validation.semanticValidationCompleted,
      };
    }

    await updateCampaignOffer({
      campaignId,
      ...values,
      offerValidationJson: {
        conflicts: validation.conflicts,
        semanticValidationCompleted: validation.semanticValidationCompleted,
      },
      offerValidationHash: validation.hash,
      offerConflictAcknowledgedHash:
        validation.conflicts.length > 0 ? validation.hash : null,
      offerConflictAcknowledgedAt:
        validation.conflicts.length > 0 ? new Date() : null,
    });
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return {
      ok: true,
      message:
        validation.conflicts.length > 0
          ? "Offer saved with acknowledged conflicts."
          : "Offer saved.",
      values,
      offerConflicts: validation.conflicts,
      semanticValidationCompleted: validation.semanticValidationCompleted,
    };
  } catch (error) {
    console.error("Failed to update campaign offer.", error);
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : "Unable to update the campaign offer. Please try again.",
      values,
    };
  }
}

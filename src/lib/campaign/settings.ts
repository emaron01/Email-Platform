import "server-only";

import type { EmailLength, Prisma } from "@prisma/client";
import { EMAIL_GUIDANCE_MAX_CHARS } from "@/lib/campaign/save";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";

export async function updateCampaignEmailSettings(input: {
  campaignId: string;
  emailLength: EmailLength;
  emailGuidance: string | null;
}): Promise<void> {
  const organizationId = await requireOrganizationId();
  const emailGuidance = input.emailGuidance?.trim() || null;

  if (emailGuidance && emailGuidance.length > EMAIL_GUIDANCE_MAX_CHARS) {
    throw new TenantError(
      `Email guidance must be ${EMAIL_GUIDANCE_MAX_CHARS} characters or fewer.`,
    );
  }

  const { assertCampaignNotArchived } = await import(
    "@/lib/suppression/service"
  );
  await assertCampaignNotArchived(organizationId, input.campaignId);

  const result = await prisma.campaign.updateMany({
    where: {
      id: input.campaignId,
      organizationId,
      archivedAt: null,
    },
    data: {
      emailLength: input.emailLength,
      emailGuidance,
    },
  });

  if (result.count !== 1) {
    throw new TenantError(
      "Campaign does not belong to the active organization.",
    );
  }
}

export async function getCampaignOfferValidationTarget(campaignId: string) {
  const organizationId = await requireOrganizationId();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: {
      id: true,
      organizationId: true,
      productId: true,
      personaId: true,
    },
  });
  if (!campaign) {
    throw new TenantError(
      "Campaign does not belong to the active organization.",
    );
  }
  return campaign;
}

export async function updateCampaignOffer(input: {
  campaignId: string;
  offerName: string | null;
  offerDescription: string | null;
  offerCta: string | null;
  offerNotes: string | null;
  offerValidationJson: Prisma.InputJsonValue;
  offerValidationHash: string;
  offerConflictAcknowledgedHash: string | null;
  offerConflictAcknowledgedAt: Date | null;
}): Promise<void> {
  const organizationId = await requireOrganizationId();
  const { assertCampaignNotArchived } = await import(
    "@/lib/suppression/service"
  );
  await assertCampaignNotArchived(organizationId, input.campaignId);
  const result = await prisma.campaign.updateMany({
    where: { id: input.campaignId, organizationId, archivedAt: null },
    data: {
      offerName: input.offerName?.trim() || null,
      offerDescription: input.offerDescription?.trim() || null,
      offerCta: input.offerCta?.trim() || null,
      offerNotes: input.offerNotes?.trim() || null,
      offerValidationJson: input.offerValidationJson,
      offerValidationHash: input.offerValidationHash,
      offerConflictAcknowledgedHash: input.offerConflictAcknowledgedHash,
      offerConflictAcknowledgedAt: input.offerConflictAcknowledgedAt,
    },
  });
  if (result.count !== 1) {
    throw new TenantError(
      "Campaign does not belong to the active organization.",
    );
  }
}

import "server-only";

import type { EmailLength } from "@prisma/client";
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

  const result = await prisma.campaign.updateMany({
    where: {
      id: input.campaignId,
      organizationId,
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

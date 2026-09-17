/**
 * Whether a user may stop/restore cadence on a campaign contact.
 * OWNER/ADMIN: any contact in the org.
 * MEMBER: only contacts on campaigns they own, or contacts on their SHARED execution.
 */
import "server-only";

import { canViewAllActivity } from "@/lib/campaign/visibility";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";

export async function assertCanManageContactCadence(input: {
  campaignContactId: string;
  organizationId: string;
  userId: string;
  role: string;
}): Promise<void> {
  if (canViewAllActivity(input.role)) return;

  const row = await prisma.campaignContact.findFirst({
    where: {
      id: input.campaignContactId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      executionId: true,
      campaign: {
        select: {
          ownerUserId: true,
          visibility: true,
        },
      },
      execution: {
        select: { userId: true },
      },
    },
  });

  if (!row) {
    throw new TenantError(
      "Campaign contact does not belong to the active organization.",
    );
  }

  if (row.campaign.ownerUserId === input.userId) return;
  if (row.execution?.userId === input.userId) return;

  throw new TenantError(
    "You can only change cadence on contacts in campaigns you own.",
  );
}

/**
 * Campaign soft-archive. History (contacts, drafts, sends) stays intact.
 * Archived campaigns are hidden from home and the campaign list by default
 * and are read-only until unarchived.
 */

import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";

export function campaignArchiveConfirmBody(): string {
  return [
    "This archives the campaign. It will be hidden from Home and the campaign list by default.",
    "No new emails can be generated or sent, and contacts cannot be changed, until it is unarchived.",
    "History stays intact. Archiving is reversible.",
  ].join("\n");
}

export async function archiveCampaign(id: string): Promise<{
  mode: "archived";
  message: string;
}> {
  const organizationId = await requireOrganizationId();
  const existing = await prisma.campaign.findFirst({
    where: { id, organizationId },
    select: { id: true, archivedAt: true },
  });
  if (!existing) {
    throw new TenantError("Campaign not found in the active organization.");
  }
  if (existing.archivedAt) {
    return { mode: "archived", message: "Campaign is already archived." };
  }
  await prisma.campaign.update({
    where: { id: existing.id },
    data: { archivedAt: new Date() },
  });
  return {
    mode: "archived",
    message: "Campaign archived. It is hidden from Home and the campaign list until you unarchive it.",
  };
}

export async function unarchiveCampaign(id: string): Promise<{
  mode: "unarchived";
  message: string;
}> {
  const organizationId = await requireOrganizationId();
  const existing = await prisma.campaign.findFirst({
    where: { id, organizationId },
    select: { id: true, archivedAt: true },
  });
  if (!existing) {
    throw new TenantError("Campaign not found in the active organization.");
  }
  if (!existing.archivedAt) {
    return { mode: "unarchived", message: "Campaign is not archived." };
  }
  await prisma.campaign.update({
    where: { id: existing.id },
    data: { archivedAt: null },
  });
  return {
    mode: "unarchived",
    message: "Campaign unarchived. It appears in Home and the campaign list again.",
  };
}

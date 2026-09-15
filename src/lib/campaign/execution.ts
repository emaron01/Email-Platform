/**
 * Personal execution of a SHARED campaign.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";

export async function createCampaignExecution(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
}): Promise<{ executionId: string }> {
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: input.campaignId,
      organizationId: input.organizationId,
    },
    select: { visibility: true, archivedAt: true },
  });
  if (!campaign || campaign.archivedAt) {
    throw new TenantError("Campaign not found.");
  }
  if (campaign.visibility !== "SHARED") {
    throw new TenantError("Only shared campaigns can be used this way.");
  }

  const execution = await prisma.campaignExecution.create({
    data: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: input.userId,
    },
    select: { id: true },
  });
  return { executionId: execution.id };
}

export async function requireCampaignExecution(input: {
  organizationId: string;
  executionId: string;
  campaignId: string;
  userId?: string;
}): Promise<{ id: string; userId: string }> {
  const execution = await prisma.campaignExecution.findFirst({
    where: {
      id: input.executionId,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      ...(input.userId ? { userId: input.userId } : {}),
    },
    select: { id: true, userId: true },
  });
  if (!execution) {
    throw new TenantError("Campaign execution not found.");
  }
  return execution;
}

export async function listCampaignExecutionsForOrg(input: {
  organizationId: string;
  campaignId?: string;
}) {
  return prisma.campaignExecution.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
      campaign: { select: { id: true, name: true, visibility: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";

const campaignDetailInclude = {
  product: { select: { id: true, name: true } },
  icp: { select: { id: true, name: true } },
  persona: { select: { id: true, name: true } },
  offer: {
    select: {
      id: true,
      name: true,
      description: true,
      primaryCta: true,
      notes: true,
    },
  },
  contacts: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      selected: true,
      status: true,
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          title: true,
          company: true,
        },
      },
      emailDrafts: {
        where: { sequenceNumber: 1 },
        orderBy: { createdAt: "desc" as const },
        take: 1,
        select: {
          id: true,
          subject: true,
          body: true,
          status: true,
          source: true,
        },
      },
    },
  },
} satisfies Prisma.CampaignInclude;

export type CampaignDetail = Prisma.CampaignGetPayload<{
  include: typeof campaignDetailInclude;
}>;

export type AvailableCampaignContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  company: string | null;
  contactList: { id: string; name: string };
};

export type CompatibleScoringRun = {
  id: string;
  status: "COMPLETED" | "PARTIAL";
  createdAt: Date;
  contactList: { id: string; name: string };
  completedScoreCount: number;
};

async function requireCampaignForOrganization(
  campaignId: string,
  organizationId: string,
): Promise<{
  id: string;
  productId: string;
  icpId: string;
  personaId: string;
}> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: {
      id: true,
      productId: true,
      icpId: true,
      personaId: true,
    },
  });
  if (!campaign) {
    throw new TenantError(
      "Campaign was not found in the active organization.",
    );
  }
  return campaign;
}

export async function getCampaignDetail(
  campaignId: string,
): Promise<CampaignDetail> {
  const organizationId = await requireOrganizationId();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    include: campaignDetailInclude,
  });
  if (!campaign) {
    throw new TenantError(
      "Campaign was not found in the active organization.",
    );
  }
  return campaign;
}

export async function searchAvailableCampaignContacts(
  campaignId: string,
  search?: string,
): Promise<AvailableCampaignContact[]> {
  const organizationId = await requireOrganizationId();
  await requireCampaignForOrganization(campaignId, organizationId);
  const query = search?.trim() || undefined;

  return prisma.contact.findMany({
    where: {
      organizationId,
      campaignContacts: {
        none: { organizationId, campaignId },
      },
      ...(query
        ? {
            OR: [
              { firstName: { contains: query, mode: "insensitive" } },
              { lastName: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { company: { contains: query, mode: "insensitive" } },
              { title: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      title: true,
      company: true,
      contactList: { select: { id: true, name: true } },
    },
    orderBy: [
      { lastName: "asc" },
      { firstName: "asc" },
      { createdAt: "asc" },
    ],
    take: 50,
  });
}

export async function listCompatibleScoringRuns(
  campaignId: string,
): Promise<CompatibleScoringRun[]> {
  const organizationId = await requireOrganizationId();
  const campaign = await requireCampaignForOrganization(
    campaignId,
    organizationId,
  );
  const runs = await prisma.scoringRun.findMany({
    where: {
      organizationId,
      productId: campaign.productId,
      icpId: campaign.icpId,
      personaId: campaign.personaId,
      status: { in: ["COMPLETED", "PARTIAL"] },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      contactList: { select: { id: true, name: true } },
      _count: {
        select: {
          scores: { where: { scoringStatus: "COMPLETED" } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return runs
    .filter((run) => run._count.scores > 0)
    .map((run) => ({
      id: run.id,
      status: run.status as "COMPLETED" | "PARTIAL",
      createdAt: run.createdAt,
      contactList: run.contactList,
      completedScoreCount: run._count.scores,
    }));
}

async function insertCampaignContacts(input: {
  organizationId: string;
  campaignId: string;
  contactIds: string[];
}): Promise<number> {
  const contactIds = Array.from(
    new Set(input.contactIds.map((id) => id.trim()).filter(Boolean)),
  );
  if (contactIds.length === 0) {
    throw new TenantError("Select at least one contact to add.");
  }

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId: input.organizationId,
      id: { in: contactIds },
    },
    select: { id: true },
  });
  if (contacts.length !== contactIds.length) {
    throw new TenantError(
      "One or more selected contacts do not belong to the active organization.",
    );
  }

  const inserted = await prisma.campaignContact.createMany({
    data: contactIds.map((contactId) => ({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId,
      selected: true,
      status: "SELECTED",
    })),
    skipDuplicates: true,
  });
  return inserted.count;
}

export async function addContactsToCampaign(input: {
  campaignId: string;
  contactIds: string[];
}): Promise<number> {
  const organizationId = await requireOrganizationId();
  const campaign = await requireCampaignForOrganization(
    input.campaignId,
    organizationId,
  );
  return insertCampaignContacts({
    organizationId,
    campaignId: campaign.id,
    contactIds: input.contactIds,
  });
}

export async function addScoringRunContactsToCampaign(input: {
  campaignId: string;
  scoringRunId: string;
}): Promise<number> {
  const organizationId = await requireOrganizationId();
  const campaign = await requireCampaignForOrganization(
    input.campaignId,
    organizationId,
  );
  const run = await prisma.scoringRun.findFirst({
    where: {
      id: input.scoringRunId,
      organizationId,
      productId: campaign.productId,
      icpId: campaign.icpId,
      personaId: campaign.personaId,
      status: { in: ["COMPLETED", "PARTIAL"] },
    },
    select: { id: true },
  });
  if (!run) {
    throw new TenantError(
      "Scoring run does not match this campaign in the active organization.",
    );
  }

  const scores = await prisma.contactScore.findMany({
    where: {
      organizationId,
      scoringRunId: run.id,
      scoringStatus: "COMPLETED",
    },
    select: { contactId: true },
  });
  if (scores.length === 0) {
    throw new TenantError("This scoring run has no completed contact scores.");
  }

  return insertCampaignContacts({
    organizationId,
    campaignId: campaign.id,
    contactIds: scores.map((score) => score.contactId),
  });
}

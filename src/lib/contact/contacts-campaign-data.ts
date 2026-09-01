import "server-only";

import type { Prisma, QualificationBucket } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scoringRunPersonaWhere } from "@/lib/campaign/personas";
import {
  formatContactCampaignLine,
  resolveContactCampaignQualification,
} from "@/lib/contact/campaign-summary";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";

export type ContactCampaignSummaryLine = {
  campaignId: string;
  campaignName: string;
  line: string;
  sentCount: number;
};

export async function loadContactCampaignSummaries(
  contactIds: string[],
): Promise<Map<string, ContactCampaignSummaryLine[]>> {
  const summaries = new Map<string, ContactCampaignSummaryLine[]>();
  if (contactIds.length === 0) {
    return summaries;
  }

  const organizationId = await requireOrganizationId();
  const campaignContacts = await prisma.campaignContact.findMany({
    where: {
      organizationId,
      contactId: { in: contactIds },
      campaign: { archivedAt: null },
    },
    select: {
      contactId: true,
      campaign: {
        select: {
          id: true,
          name: true,
          productId: true,
          icpId: true,
          personaId: true,
        },
      },
      emailDrafts: {
        where: { status: "SENT" },
        select: { id: true, status: true },
      },
    },
    orderBy: [{ campaign: { name: "asc" } }, { createdAt: "asc" }],
  });

  if (campaignContacts.length === 0) {
    return summaries;
  }

  const contactsByCampaign = new Map<
    string,
    {
      campaign: (typeof campaignContacts)[number]["campaign"];
      rows: Array<{
        contactId: string;
        sentCount: number;
      }>;
    }
  >();

  for (const row of campaignContacts) {
    const entry = contactsByCampaign.get(row.campaign.id) ?? {
      campaign: row.campaign,
      rows: [],
    };
    entry.rows.push({
      contactId: row.contactId,
      sentCount: row.emailDrafts.length,
    });
    contactsByCampaign.set(row.campaign.id, entry);
  }

  const qualificationByCampaignContact = new Map<
    string,
    { bucket: QualificationBucket; statusDetail: string | null }
  >();

  await Promise.all(
    [...contactsByCampaign.values()].map(async ({ campaign, rows }) => {
      const qualifications = await qualifyContactsForCampaign(
        organizationId,
        campaign,
        rows.map((row) => row.contactId),
      );
      for (const [contactId, qualification] of qualifications) {
        qualificationByCampaignContact.set(
          `${campaign.id}:${contactId}`,
          qualification,
        );
      }
    }),
  );

  for (const { campaign, rows } of contactsByCampaign.values()) {
    for (const row of rows) {
      const qualification = qualificationByCampaignContact.get(
        `${campaign.id}:${row.contactId}`,
      );
      const line = formatContactCampaignLine({
        campaignName: campaign.name,
        bucket: qualification?.bucket ?? null,
        statusDetail: qualification?.statusDetail ?? null,
        sentCount: row.sentCount,
      });
      const existing = summaries.get(row.contactId) ?? [];
      existing.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        line,
        sentCount: row.sentCount,
      });
      summaries.set(row.contactId, existing);
    }
  }

  return summaries;
}

async function qualifyContactsForCampaign(
  organizationId: string,
  campaign: {
    id: string;
    productId: string;
    icpId: string;
    personaId: string | null;
  },
  contactIds: string[],
): Promise<
  Map<string, { bucket: QualificationBucket; statusDetail: string | null }>
> {
  const result = new Map<
    string,
    { bucket: QualificationBucket; statusDetail: string | null }
  >();
  if (contactIds.length === 0) {
    return result;
  }

  const compatibleRuns = await prisma.scoringRun.findMany({
    where: await compatibleScoringRunWhere(campaign, organizationId),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      _count: {
        select: {
          scores: {
            where: {
              contactId: { in: contactIds },
              scoringStatus: { in: ["COMPLETED", "SUPPRESSED"] },
            },
          },
        },
      },
    },
  });

  const selectedRun = compatibleRuns
    .filter((candidate) => candidate._count.scores > 0)
    .sort((left, right) => right._count.scores - left._count.scores)[0];
  if (!selectedRun) {
    return result;
  }

  const run = await prisma.scoringRun.findFirst({
    where: { id: selectedRun.id, organizationId },
    select: {
      scores: {
        where: {
          contactId: { in: contactIds },
          scoringStatus: { in: ["COMPLETED", "SUPPRESSED"] },
        },
        select: {
          contactId: true,
          scoringStatus: true,
          scoreLabel: true,
          assessmentData: true,
          criterionAssessments: true,
          matchedPersona: { select: { name: true } },
        },
      },
      qualificationOverrides: {
        where: {
          targetType: "CONTACT",
          targetId: { in: contactIds },
        },
        select: {
          targetId: true,
          bucket: true,
        },
      },
    },
  });
  if (!run) {
    return result;
  }

  const overrides = new Map(
    run.qualificationOverrides.map((row) => [row.targetId, row.bucket]),
  );

  for (const score of run.scores) {
    const qualification = resolveContactCampaignQualification({
      scoringStatus: score.scoringStatus,
      scoreLabel: score.scoreLabel,
      assessmentData: score.assessmentData,
      criterionAssessments: score.criterionAssessments,
      matchedPersonaName: score.matchedPersona?.name ?? null,
      overrideBucket: overrides.get(score.contactId) ?? null,
    });
    result.set(score.contactId, qualification);
  }

  return result;
}

async function compatibleScoringRunWhere(
  campaign: {
    id: string;
    productId: string;
    icpId: string;
    personaId: string | null;
  },
  organizationId: string,
): Promise<Prisma.ScoringRunWhereInput> {
  const [inPlay, productPersonas] = await Promise.all([
    prisma.campaignPersona.findMany({
      where: { organizationId, campaignId: campaign.id },
      select: { personaId: true },
    }),
    prisma.persona.findMany({
      where: {
        organizationId,
        productId: campaign.productId,
        archivedAt: null,
      },
      select: { id: true },
    }),
  ]);

  return {
    organizationId,
    productId: campaign.productId,
    icpId: campaign.icpId,
    status: { in: ["COMPLETED", "PARTIAL"] },
    contactList: { archivedAt: null },
    OR: scoringRunPersonaWhere({
      campaignFallbackPersonaId: campaign.personaId,
      campaignInPlayPersonaIds: inPlay.map((row) => row.personaId),
      productPersonaIds: productPersonas.map((persona) => persona.id),
    }),
  };
}

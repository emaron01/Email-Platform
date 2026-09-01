import "server-only";

import type { Prisma, QualificationBucket } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { readIcpQualification } from "@/lib/scoring/icp-qualification";
import {
  firstUnresolvedCriterion,
  firstUnresolvedDimension,
  scoreLabelToBucket,
} from "@/lib/workflow/qualification";
import type { QualificationBucketRow } from "@/components/QualificationBuckets";
import { readExclusionDetails } from "@/lib/scoring/exclusion-detail";
import { scoringRunPersonaWhere } from "@/lib/campaign/personas";

const campaignDetailInclude = {
  product: {
    select: {
      id: true,
      name: true,
      description: true,
      valueProposition: true,
      messagingJson: true,
      personas: {
        where: { archivedAt: null },
        select: { id: true, name: true },
      },
    },
  },
  icp: { select: { id: true, name: true } },
  persona: {
    select: {
      id: true,
      name: true,
      messagingNotes: true,
      personaMessagingJson: true,
    },
  },
  personasInPlay: {
    include: { persona: { select: { id: true, name: true } } },
  },
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
      chosenPersonaId: true,
      sequenceStoppedAt: true,
      sequenceStoppedReason: true,
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          title: true,
          company: true,
          companyId: true,
        },
      },
      emailDrafts: {
        orderBy: { sequenceNumber: "asc" as const },
        select: {
          id: true,
          sequenceNumber: true,
          subject: true,
          body: true,
          status: true,
          source: true,
          generationQuotaCommitted: true,
          kind: true,
          sentAt: true,
          sentMethod: true,
          sendRecords: {
            where: { method: "DEEPLINK_INTENT" as const },
            orderBy: { occurredAt: "desc" as const },
            take: 1,
            select: { occurredAt: true },
          },
          replyClassification: true,
          prospectReplyText: true,
          referralSuggested: true,
          inReplyToDraftId: true,
          emailLength: true,
          personaId: true,
          personalizationTier: true,
          personalizationSources: true,
          claimConflictsJson: true,
          createdAt: true,
          updatedAt: true,
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
  contactLists: Array<{ id: string; name: string }>;
};

export type CompatibleScoringRun = {
  id: string;
  status: "COMPLETED" | "PARTIAL";
  createdAt: Date;
  contactList: { id: string; name: string };
  completedScoreCount: number;
};

export type CampaignQualificationView = {
  scoringRunId: string | null;
  companyRows: QualificationBucketRow[];
  contactRows: QualificationBucketRow[];
};

export async function getCampaignQualificationView(
  campaignId: string,
): Promise<CampaignQualificationView> {
  const organizationId = await requireOrganizationId();
  const campaign = await requireCampaignForOrganization(
    campaignId,
    organizationId,
  );
  const attachedContacts = await prisma.campaignContact.findMany({
    where: { organizationId, campaignId },
    select: { contactId: true },
  });
  const attachedContactIds = attachedContacts.map((row) => row.contactId);
  if (attachedContactIds.length === 0) {
    return { scoringRunId: null, companyRows: [], contactRows: [] };
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
              contactId: { in: attachedContactIds },
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
    return { scoringRunId: null, companyRows: [], contactRows: [] };
  }
  const run = await prisma.scoringRun.findFirst({
    where: {
      id: selectedRun.id,
      organizationId,
    },
    include: {
      icp: {
        include: {
          criteria: {
            select: { id: true, name: true, researchGuidance: true },
          },
        },
      },
      persona: {
        include: {
          criteria: {
            select: { id: true, name: true, researchGuidance: true },
          },
        },
      },
      scores: {
        where: {
          contactId: { in: attachedContactIds },
          scoringStatus: { in: ["COMPLETED", "SUPPRESSED"] },
        },
        include: {
          contact: {
            include: {
              companyRecord: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      qualificationOverrides: true,
    },
  });
  if (!run) {
    return { scoringRunId: null, companyRows: [], contactRows: [] };
  }
  const guidance = new Map<string, string | null>();
  for (const criterion of [
    ...run.icp.criteria,
    ...(run.persona?.criteria ?? []),
  ]) {
    guidance.set(criterion.id, criterion.researchGuidance);
    guidance.set(
      criterion.name.trim().toLowerCase(),
      criterion.researchGuidance,
    );
  }
  const override = new Map(
    run.qualificationOverrides.map((row) => [
      `${row.targetType}:${row.targetId}`,
      row.bucket,
    ]),
  );
  const contactRows: QualificationBucketRow[] = run.scores.map((score) => {
    const suppressed = score.scoringStatus === "SUPPRESSED";
    const unresolved = suppressed
      ? null
      : firstUnresolvedCriterion(score.criterionAssessments) ??
        firstUnresolvedDimension(score.assessmentData);
    const inferred = suppressed
      ? "EXCLUDED"
      : scoreLabelToBucket(score.scoreLabel, score.assessmentData);
    const bucket = override.get(`CONTACT:${score.contactId}`) ?? inferred;
    const name =
      [score.contact.firstName, score.contact.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      score.contact.email ||
      "Unnamed contact";
    return {
      id: score.contactId,
      companyId: score.contact.companyId,
      targetType: "CONTACT",
      name,
      title: score.contact.title,
      company:
        score.contact.companyRecord?.name ?? score.contact.company ?? null,
      bucket,
      unresolvedCriterion: suppressed
        ? "Opted out — organization-wide suppression. Cannot be scored or emailed."
        : unresolved
          ? `${unresolved.reasoning.replace(/[.]+$/, "")} · Research this contact`
        : bucket === "NEEDS_REVIEW"
          ? "Qualification is incomplete · Review this contact"
          : null,
      researchGuidance: unresolved?.criterionId
        ? (guidance.get(unresolved.criterionId) ?? null)
        : unresolved
          ? (guidance.get(unresolved.name.trim().toLowerCase()) ?? null)
          : null,
      researchHref: `/scoring/${run.id}#contact-${score.contactId}`,
      canOverride: !suppressed,
      secondaryFlags:
        readIcpQualification(score.assessmentData)?.secondaryFlags.map(
          (flag) => flag.text,
        ) ?? [],
      exclusionDetails:
        bucket === "EXCLUDED"
          ? readExclusionDetails(score.assessmentData)
          : undefined,
    };
  });

  const grouped = new Map<
    string,
    {
      id: string;
      name: string;
      canOverride: boolean;
      buckets: QualificationBucket[];
      unresolved: ReturnType<typeof firstUnresolvedCriterion>;
      secondaryFlags: string[];
    }
  >();
  for (const score of run.scores) {
    const companyId = score.contact.companyRecord?.id ?? null;
    const name =
      score.contact.companyRecord?.name ??
      score.contact.company?.trim() ??
      "Company not provided";
    const key = companyId ? `id:${companyId}` : `name:${name.toLowerCase()}`;
    const entry = grouped.get(key) ?? {
      id: companyId ?? key,
      name,
      canOverride: Boolean(companyId),
      buckets: [],
      unresolved: null,
      secondaryFlags: [],
    };
    entry.buckets.push(
      scoreLabelToBucket(score.scoreLabel, score.assessmentData),
    );
    const flags =
      readIcpQualification(score.assessmentData)?.secondaryFlags ?? [];
    entry.secondaryFlags = Array.from(
      new Set([...entry.secondaryFlags, ...flags.map((flag) => flag.text)]),
    );
    entry.unresolved ??=
      firstUnresolvedCriterion(score.criterionAssessments) ??
      firstUnresolvedDimension(score.assessmentData);
    grouped.set(key, entry);
  }
  const companyRows: QualificationBucketRow[] = [...grouped.values()].map(
    (entry) => {
      const inferred: QualificationBucket = entry.buckets.every(
        (bucket) => bucket === "EXCLUDED",
      )
        ? "EXCLUDED"
        : entry.buckets.some((bucket) => bucket === "NEEDS_REVIEW")
          ? "NEEDS_REVIEW"
          : "GOOD";
      const bucket =
        (entry.canOverride ? override.get(`COMPANY:${entry.id}`) : undefined) ??
        inferred;
      return {
        id: entry.id,
        targetType: "COMPANY",
        name: entry.name,
        bucket,
        unresolvedCriterion: entry.unresolved
          ? `${entry.unresolved.reasoning.replace(/[.]+$/, "")} · Research this company`
          : bucket === "NEEDS_REVIEW"
            ? "Company qualification is incomplete · Research this company"
            : null,
        researchGuidance: entry.unresolved?.criterionId
          ? (guidance.get(entry.unresolved.criterionId) ?? null)
          : entry.unresolved
            ? (guidance.get(entry.unresolved.name.trim().toLowerCase()) ?? null)
            : null,
        researchHref: entry.canOverride
          ? `/companies/${entry.id}`
          : `/scoring/${run.id}`,
        canOverride: entry.canOverride,
        secondaryFlags: entry.secondaryFlags,
      };
    },
  );
  const bucketOrder: Record<QualificationBucket, number> = {
    GOOD: 0,
    NEEDS_REVIEW: 1,
    POOR_FIT: 2,
    EXCLUDED: 3,
  };
  companyRows.sort((a, b) => {
    const bucketDelta = bucketOrder[a.bucket] - bucketOrder[b.bucket];
    if (bucketDelta !== 0) return bucketDelta;
    return (b.secondaryFlags?.length ?? 0) - (a.secondaryFlags?.length ?? 0);
  });
  contactRows.sort((a, b) => {
    const bucketDelta = bucketOrder[a.bucket] - bucketOrder[b.bucket];
    if (bucketDelta !== 0) return bucketDelta;
    return (b.secondaryFlags?.length ?? 0) - (a.secondaryFlags?.length ?? 0);
  });
  return { scoringRunId: run.id, companyRows, contactRows };
}

async function requireCampaignForOrganization(
  campaignId: string,
  organizationId: string,
): Promise<{
  id: string;
  productId: string;
  icpId: string;
  personaId: string | null;
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
    throw new TenantError("Campaign was not found in the active organization.");
  }
  return campaign;
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

export async function getCampaignDetail(
  campaignId: string,
): Promise<CampaignDetail> {
  const organizationId = await requireOrganizationId();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    include: campaignDetailInclude,
  });
  if (!campaign) {
    throw new TenantError("Campaign was not found in the active organization.");
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

  const { listActiveNormalizedEmails, contactMatchesSuppressionSet } =
    await import("@/lib/suppression/service");

  const rows = await prisma.contact.findMany({
    where: {
      organizationId,
      archivedAt: null,
      normalizedEmail: { not: null },
      memberships: {
        some: { contactList: { archivedAt: null } },
      },
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
      memberships: {
        where: { contactList: { archivedAt: null } },
        select: {
          contactList: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { createdAt: "asc" }],
    take: 80,
  });
  const suppressed = await listActiveNormalizedEmails(
    organizationId,
    rows.map((row) => row.email),
  );
  return rows
    .filter((row) => !contactMatchesSuppressionSet(row.email, suppressed))
    .slice(0, 50)
    .map((row) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      title: row.title,
      company: row.company,
      contactLists: row.memberships.map((membership) => membership.contactList),
    }));
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
    where: await compatibleScoringRunWhere(campaign, organizationId),
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
      archivedAt: null,
    },
    select: {
      id: true,
      email: true,
      normalizedEmail: true,
      memberships: {
        select: {
          contactList: { select: { archivedAt: true } },
        },
      },
    },
  });
  if (contacts.length !== contactIds.length) {
    throw new TenantError(
      "One or more selected contacts do not belong to the active organization.",
    );
  }
  if (
    contacts.some(
      (contact) =>
        contact.memberships.length > 0 &&
        contact.memberships.every(
          (membership) => membership.contactList.archivedAt != null,
        ),
    )
  ) {
    throw new TenantError(
      "Contacts whose only lists are archived cannot be added to a campaign.",
    );
  }
  if (contacts.some((contact) => !contact.normalizedEmail)) {
    throw new TenantError(
      "Contacts without an email address cannot be added to a campaign.",
    );
  }
  const { listActiveNormalizedEmails, contactMatchesSuppressionSet } =
    await import("@/lib/suppression/service");
  const suppressed = await listActiveNormalizedEmails(
    input.organizationId,
    contacts.map((contact) => contact.email),
  );
  if (
    contacts.some((contact) =>
      contactMatchesSuppressionSet(contact.email, suppressed),
    )
  ) {
    throw new TenantError(
      "One or more selected contacts are on the organization do-not-contact list.",
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
  if (inserted.count > 0) {
    const { recomputeCampaignContactCadenceBatch } = await import(
      "@/lib/cadence/recompute"
    );
    const created = await prisma.campaignContact.findMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        contactId: { in: contactIds },
      },
      select: { id: true },
    });
    await recomputeCampaignContactCadenceBatch(created.map((row) => row.id));
  }
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
  const { assertCampaignNotArchived } = await import(
    "@/lib/suppression/service"
  );
  await assertCampaignNotArchived(organizationId, campaign.id);
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
      ...(await compatibleScoringRunWhere(campaign, organizationId)),
    },
    select: { id: true },
  });
  if (!run) {
    throw new TenantError(
      "Scoring run does not match this campaign in the active organization.",
    );
  }
  const { assertCampaignNotArchived } = await import(
    "@/lib/suppression/service"
  );
  await assertCampaignNotArchived(organizationId, campaign.id);

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

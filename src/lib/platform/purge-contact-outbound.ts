/**
 * Selective purge: contact + outbound data for an organization.
 * Keeps account, setup (products/ICPs/personas/voice/signature), billing, credits, referrals.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAdminAuditEvent } from "@/lib/auth/audit";

export {
  CONTACT_OUTBOUND_PURGE_CONFIRM_PHRASE,
  contactOutboundPurgeConfirmSummary,
} from "@/lib/platform/purge-contact-outbound-shared";

export type ContactOutboundPurgeCounts = {
  emailSendRecords: number;
  emailDrafts: number;
  campaignContacts: number;
  campaignPersonas: number;
  campaigns: number;
  qualificationOverrides: number;
  titleSuggestions: number;
  contactScores: number;
  researchRuns: number;
  scoringRuns: number;
  contactListMemberships: number;
  contactResearch: number;
  contacts: number;
  contactLists: number;
  companyResearch: number;
  companies: number;
  contactMergeAudits: number;
  productTitleDismissals: number;
  emailSuppressions: number;
};

export async function purgeOrganizationContactOutboundData(input: {
  organizationId: string;
  actorUserId: string;
}): Promise<ContactOutboundPurgeCounts> {
  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, name: true },
  });
  if (!org) {
    throw new Error("Organization not found.");
  }

  const counts = await prisma.$transaction(
    async (tx) => {
      const oid = input.organizationId;
      const c: ContactOutboundPurgeCounts = {
        emailSendRecords: 0,
        emailDrafts: 0,
        campaignContacts: 0,
        campaignPersonas: 0,
        campaigns: 0,
        qualificationOverrides: 0,
        titleSuggestions: 0,
        contactScores: 0,
        researchRuns: 0,
        scoringRuns: 0,
        contactListMemberships: 0,
        contactResearch: 0,
        contacts: 0,
        contactLists: 0,
        companyResearch: 0,
        companies: 0,
        contactMergeAudits: 0,
        productTitleDismissals: 0,
        emailSuppressions: 0,
      };

      c.emailSendRecords = (
        await tx.emailSendRecord.deleteMany({ where: { organizationId: oid } })
      ).count;

      await tx.emailDraft.updateMany({
        where: { organizationId: oid, inReplyToDraftId: { not: null } },
        data: { inReplyToDraftId: null },
      });
      c.emailDrafts = (
        await tx.emailDraft.deleteMany({ where: { organizationId: oid } })
      ).count;

      c.campaignContacts = (
        await tx.campaignContact.deleteMany({ where: { organizationId: oid } })
      ).count;
      c.campaignPersonas = (
        await tx.campaignPersona.deleteMany({ where: { organizationId: oid } })
      ).count;
      c.campaigns = (
        await tx.campaign.deleteMany({ where: { organizationId: oid } })
      ).count;

      c.qualificationOverrides = (
        await tx.qualificationBucketOverride.deleteMany({
          where: { organizationId: oid },
        })
      ).count;
      c.titleSuggestions = (
        await tx.titleSuggestion.deleteMany({ where: { organizationId: oid } })
      ).count;
      c.contactScores = (
        await tx.contactScore.deleteMany({ where: { organizationId: oid } })
      ).count;

      await tx.researchRun.updateMany({
        where: { organizationId: oid, retryOfRunId: { not: null } },
        data: { retryOfRunId: null },
      });
      c.researchRuns = (
        await tx.researchRun.deleteMany({ where: { organizationId: oid } })
      ).count;
      c.scoringRuns = (
        await tx.scoringRun.deleteMany({ where: { organizationId: oid } })
      ).count;

      c.contactListMemberships = (
        await tx.contactListMembership.deleteMany({
          where: { organizationId: oid },
        })
      ).count;
      c.contactResearch = (
        await tx.contactResearch.deleteMany({ where: { organizationId: oid } })
      ).count;

      await tx.contact.updateMany({
        where: { organizationId: oid },
        data: { archivedByListId: null, companyId: null },
      });
      c.contacts = (
        await tx.contact.deleteMany({ where: { organizationId: oid } })
      ).count;
      c.contactLists = (
        await tx.contactList.deleteMany({ where: { organizationId: oid } })
      ).count;

      c.companyResearch = (
        await tx.companyResearch.deleteMany({ where: { organizationId: oid } })
      ).count;
      c.companies = (
        await tx.company.deleteMany({ where: { organizationId: oid } })
      ).count;

      c.contactMergeAudits = (
        await tx.contactMergeAudit.deleteMany({
          where: { organizationId: oid },
        })
      ).count;
      c.productTitleDismissals = (
        await tx.productTitleDismissal.deleteMany({
          where: { organizationId: oid },
        })
      ).count;
      c.emailSuppressions = (
        await tx.emailSuppression.deleteMany({
          where: { organizationId: oid },
        })
      ).count;

      return c;
    },
    { timeout: 120_000 },
  );

  await recordAdminAuditEvent({
    action: "PLATFORM_CONTACT_OUTBOUND_PURGED",
    actorUserId: input.actorUserId,
    organizationId: org.id,
    metadata: {
      organizationId: org.id,
      organizationName: org.name,
      counts,
    },
  });

  return counts;
}

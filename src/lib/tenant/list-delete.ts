/**
 * Ordered archive / hard-delete of a ContactList.
 *
 * FK inventory referencing ContactList (prisma/schema.prisma):
 * - Contact.contactListId → ContactList ON DELETE CASCADE
 * - ScoringRun.contactListId → ContactList ON DELETE CASCADE
 *
 * Via Contact (Contact.contactListId is required — a Contact cannot be
 * detached from its list):
 * - ContactScore.contactId → Contact ON DELETE CASCADE
 * - ContactResearch.contactId → Contact ON DELETE CASCADE
 * - CampaignContact.contactId → Contact ON DELETE CASCADE
 *
 * Via CampaignContact:
 * - EmailDraft.campaignContactId → CampaignContact ON DELETE CASCADE
 * - EmailSendRecord.campaignContactId → CampaignContact ON DELETE CASCADE
 * - EmailDraft.inReplyToDraftId → EmailDraft ON DELETE SET NULL
 *
 * Via ScoringRun:
 * - ContactScore.scoringRunId → ScoringRun ON DELETE CASCADE
 * - TitleSuggestion.scoringRunId → ScoringRun ON DELETE CASCADE
 * - QualificationBucketOverride.scoringRunId → ScoringRun ON DELETE CASCADE
 *
 * Not a ContactList FK:
 * - Company / CompanyResearch (Contact.companyId ON DELETE SET NULL)
 * - Campaign has no contactListId; attachment is CampaignContact → Contact
 * - EmailSuppression is org+email keyed, not list-owned
 * - UsageEvent is append-only metering — do not touch
 *
 * Contacts are not shared across lists. A Contact belongs to exactly one
 * ContactList. "Referenced elsewhere" means a CampaignContact (possibly in
 * another campaign) points at that Contact. Hard-deleting the list would
 * CASCADE-destroy those campaign rows, drafts, and send records — not leave
 * an orphan, but erase campaign history. That is why active-campaign
 * attachment blocks delete, and any CampaignContact or scoring history
 * archives instead of hard-deleting.
 *
 * Block vs archive (same Product/Persona pattern):
 * - Attached to a non-archived campaign → block hard delete, offer archive.
 * - Scoring runs exist, or any CampaignContact exists (including archived
 *   campaigns) → archive rather than hard delete so history keeps meaning.
 * - Neither → ordered hard delete in a transaction.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";

type Tx = Prisma.TransactionClient;

export type ListLifecycleImpact = {
  contactCount: number;
  scoringRunCount: number;
  campaignCount: number;
  activeCampaignCount: number;
  draftCount: number;
  sentCount: number;
};

export type ListDeleteDecision = {
  mode: "blocked" | "archive" | "delete";
  impact: ListLifecycleImpact;
  message: string;
};

export function listDeleteConfirmBody(decision: ListDeleteDecision): string {
  const { impact } = decision;
  if (decision.mode === "blocked") {
    return [
      `This list cannot be deleted because its contacts are attached to ${impact.activeCampaignCount} active campaign(s).`,
      "",
      `${impact.contactCount} contact(s)`,
      `${impact.scoringRunCount} scoring run(s)`,
      `${impact.campaignCount} campaign(s) affected`,
      "",
      "Archive instead. Archiving is reversible and keeps history intact.",
    ].join("\n");
  }
  if (decision.mode === "archive") {
    return [
      "This list has scoring or campaign history, so it will be archived rather than permanently deleted.",
      "",
      `${impact.contactCount} contact(s)`,
      `${impact.scoringRunCount} scoring run(s)`,
      `${impact.campaignCount} campaign(s) affected`,
      "",
      "Archiving is reversible. Historical scoring runs keep their meaning.",
    ].join("\n");
  }
  return [
    "This permanently deletes this list and its contacts.",
    "",
    `${impact.contactCount} contact(s)`,
    `${impact.scoringRunCount} scoring run(s)`,
    `${impact.campaignCount} campaign(s) affected`,
    "",
    "This cannot be undone.",
  ].join("\n");
}

export function listArchiveConfirmBody(): string {
  return [
    "This archives the list. It will be hidden from campaign setup, scoring, and list selectors by default.",
    "The list is read-only until unarchived. Contacts and scoring history stay intact.",
    "Archiving is reversible.",
  ].join("\n");
}

export async function getListLifecycleImpact(
  organizationId: string,
  contactListId: string,
  db: Tx | typeof prisma = prisma,
): Promise<ListLifecycleImpact> {
  const contacts = await db.contact.findMany({
    where: { organizationId, contactListId },
    select: { id: true },
  });
  const contactIds = contacts.map((row) => row.id);
  const scoringRunCount = await db.scoringRun.count({
    where: { organizationId, contactListId },
  });

  if (contactIds.length === 0) {
    return {
      contactCount: 0,
      scoringRunCount,
      campaignCount: 0,
      activeCampaignCount: 0,
      draftCount: 0,
      sentCount: 0,
    };
  }

  const campaignContacts = await db.campaignContact.findMany({
    where: { organizationId, contactId: { in: contactIds } },
    select: {
      id: true,
      campaignId: true,
      campaign: { select: { id: true, archivedAt: true } },
    },
  });
  const campaignIds = new Set(campaignContacts.map((row) => row.campaignId));
  const activeCampaignIds = new Set(
    campaignContacts
      .filter((row) => row.campaign.archivedAt == null)
      .map((row) => row.campaignId),
  );
  const campaignContactIds = campaignContacts.map((row) => row.id);
  let draftCount = 0;
  let sentCount = 0;
  if (campaignContactIds.length > 0) {
    const draftScope = {
      organizationId,
      campaignContactId: { in: campaignContactIds },
    };
    draftCount = await db.emailDraft.count({ where: draftScope });
    sentCount = await db.emailDraft.count({
      where: { ...draftScope, status: "SENT" },
    });
  }

  return {
    contactCount: contacts.length,
    scoringRunCount,
    campaignCount: campaignIds.size,
    activeCampaignCount: activeCampaignIds.size,
    draftCount,
    sentCount,
  };
}

export function decideListDelete(impact: ListLifecycleImpact): ListDeleteDecision {
  if (impact.activeCampaignCount > 0) {
    return {
      mode: "blocked",
      impact,
      message: `List could not be deleted because its contacts are attached to ${impact.activeCampaignCount} active campaign(s). Archive the list instead.`,
    };
  }
  if (impact.scoringRunCount > 0 || impact.campaignCount > 0) {
    return {
      mode: "archive",
      impact,
      message: `List archived because ${impact.scoringRunCount} scoring run(s) and ${impact.campaignCount} campaign(s) reference its contacts. Historical records were preserved.`,
    };
  }
  return {
    mode: "delete",
    impact,
    message: `List deleted. Removed ${impact.contactCount} contact(s) and ${impact.scoringRunCount} scoring run(s).`,
  };
}

export async function archiveContactList(id: string): Promise<{
  mode: "archived";
  message: string;
}> {
  const organizationId = await requireOrganizationId();
  const existing = await prisma.contactList.findFirst({
    where: { id, organizationId },
    select: { id: true, archivedAt: true },
  });
  if (!existing) {
    throw new TenantError(
      "Contact list not found in the active organization.",
    );
  }
  if (existing.archivedAt) {
    return { mode: "archived", message: "List is already archived." };
  }
  await prisma.contactList.update({
    where: { id: existing.id },
    data: { archivedAt: new Date() },
  });
  return {
    mode: "archived",
    message:
      "List archived. It is hidden from campaign and scoring selectors until you unarchive it.",
  };
}

export async function unarchiveContactList(id: string): Promise<{
  mode: "unarchived";
  message: string;
}> {
  const organizationId = await requireOrganizationId();
  const existing = await prisma.contactList.findFirst({
    where: { id, organizationId },
    select: { id: true, archivedAt: true },
  });
  if (!existing) {
    throw new TenantError(
      "Contact list not found in the active organization.",
    );
  }
  if (!existing.archivedAt) {
    return { mode: "unarchived", message: "List is not archived." };
  }
  await prisma.contactList.update({
    where: { id: existing.id },
    data: { archivedAt: null },
  });
  return {
    mode: "unarchived",
    message: "List unarchived. It appears in campaign and scoring selectors again.",
  };
}

export async function deleteContactListGraph(
  tx: Tx,
  organizationId: string,
  contactListId: string,
): Promise<ListLifecycleImpact> {
  const list = await tx.contactList.findFirst({
    where: { id: contactListId, organizationId },
    select: { id: true },
  });
  if (!list) {
    throw new TenantError(
      "Contact list not found in the active organization.",
    );
  }

  const impact = await getListLifecycleImpact(
    organizationId,
    contactListId,
    tx,
  );
  const decision = decideListDelete(impact);
  if (decision.mode !== "delete") {
    throw new TenantError(decision.message);
  }

  const contacts = await tx.contact.findMany({
    where: { organizationId, contactListId },
    select: { id: true },
  });
  const contactIds = contacts.map((row) => row.id);

  if (contactIds.length > 0) {
    const campaignContacts = await tx.campaignContact.findMany({
      where: { organizationId, contactId: { in: contactIds } },
      select: { id: true },
    });
    const campaignContactIds = campaignContacts.map((row) => row.id);

    if (campaignContactIds.length > 0) {
      const draftScope = {
        organizationId,
        campaignContactId: { in: campaignContactIds },
      };
      await tx.emailSendRecord.deleteMany({
        where: { organizationId, campaignContactId: { in: campaignContactIds } },
      });
      await tx.emailDraft.updateMany({
        where: draftScope,
        data: { inReplyToDraftId: null },
      });
      await tx.emailDraft.deleteMany({ where: draftScope });
      await tx.campaignContact.deleteMany({
        where: { organizationId, id: { in: campaignContactIds } },
      });
    }

    await tx.contactResearch.deleteMany({
      where: { organizationId, contactId: { in: contactIds } },
    });
  }

  const scoringRuns = await tx.scoringRun.findMany({
    where: { organizationId, contactListId },
    select: { id: true },
  });
  const scoringRunIds = scoringRuns.map((row) => row.id);
  if (scoringRunIds.length > 0) {
    await tx.qualificationBucketOverride.deleteMany({
      where: { organizationId, scoringRunId: { in: scoringRunIds } },
    });
    await tx.titleSuggestion.deleteMany({
      where: { organizationId, scoringRunId: { in: scoringRunIds } },
    });
    await tx.contactScore.deleteMany({
      where: { organizationId, scoringRunId: { in: scoringRunIds } },
    });
    await tx.scoringRun.deleteMany({
      where: { organizationId, id: { in: scoringRunIds } },
    });
  } else if (contactIds.length > 0) {
    await tx.contactScore.deleteMany({
      where: { organizationId, contactId: { in: contactIds } },
    });
  }

  if (contactIds.length > 0) {
    await tx.contact.deleteMany({
      where: { organizationId, id: { in: contactIds } },
    });
  }

  await tx.contactList.deleteMany({
    where: { id: contactListId, organizationId },
  });

  return impact;
}

export async function deleteOrArchiveContactList(id: string): Promise<{
  mode: "deleted" | "archived";
  message: string;
  impact: ListLifecycleImpact;
}> {
  const organizationId = await requireOrganizationId();
  const existing = await prisma.contactList.findFirst({
    where: { id, organizationId },
    select: { id: true, archivedAt: true },
  });
  if (!existing) {
    throw new TenantError(
      "Contact list not found in the active organization.",
    );
  }

  const impact = await getListLifecycleImpact(organizationId, existing.id);
  const decision = decideListDelete(impact);

  if (decision.mode === "blocked") {
    throw new TenantError(decision.message);
  }

  if (decision.mode === "archive") {
    if (!existing.archivedAt) {
      await prisma.contactList.update({
        where: { id: existing.id },
        data: { archivedAt: new Date() },
      });
    }
    return {
      mode: "archived",
      message: decision.message,
      impact,
    };
  }

  await prisma.$transaction((tx) =>
    deleteContactListGraph(tx, organizationId, existing.id),
  );
  return {
    mode: "deleted",
    message: decision.message,
    impact,
  };
}

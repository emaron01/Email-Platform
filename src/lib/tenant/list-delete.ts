/**
 * Ordered archive / hard-delete of a ContactList (Phase A membership model).
 *
 * FK inventory referencing ContactList (prisma/schema.prisma):
 * - ContactListMembership.contactListId → ContactList ON DELETE CASCADE
 * - ScoringRun.contactListId → ContactList ON DELETE CASCADE
 *
 * Contacts are org-scoped and shared across lists via membership.
 * Hard-deleting a list removes memberships + list-scoped scoring history only.
 * It does NOT delete Contact rows, CampaignContact, EmailDraft, or EmailSendRecord.
 *
 * Via ScoringRun (list-scoped):
 * - ContactScore.scoringRunId → ScoringRun ON DELETE CASCADE
 * - TitleSuggestion.scoringRunId → ScoringRun ON DELETE CASCADE
 * - QualificationBucketOverride.scoringRunId → ScoringRun ON DELETE CASCADE
 *
 * Not a ContactList FK:
 * - Contact (no longer owned by a list)
 * - Campaign / CampaignContact / EmailDraft / EmailSendRecord
 * - EmailSuppression is org+email keyed, not list-owned
 * - UsageEvent is append-only metering — do not touch
 *
 * Block vs archive:
 * - Scoring runs exist for this list → archive rather than hard delete.
 * - Campaign attachment no longer blocks delete (list delete does not cascade
 *   into the campaign email graph).
 * - No scoring history → ordered hard delete of memberships + scoring cleanup + list.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";

type Tx = Prisma.TransactionClient;

export type ListLifecycleImpact = {
  /** Members of this list (not org-wide contacts). */
  contactCount: number;
  scoringRunCount: number;
  /** Campaigns that include any member of this list (informational). */
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
      `This list cannot be deleted.`,
      "",
      `${impact.contactCount} contact membership(s)`,
      `${impact.scoringRunCount} scoring run(s)`,
      "",
      "Archive instead. Archiving is reversible and keeps history intact.",
    ].join("\n");
  }
  if (decision.mode === "archive") {
    return [
      "This list has scoring history, so it will be archived rather than permanently deleted.",
      "",
      `${impact.contactCount} contact membership(s)`,
      `${impact.scoringRunCount} scoring run(s)`,
      "",
      "Archiving is reversible. Contacts stay in the organization; only this list membership is hidden with the list.",
    ].join("\n");
  }
  return [
    "This permanently deletes this list and its memberships.",
    "Contacts themselves are kept (they may appear under other lists or as unlisted).",
    "",
    `${impact.contactCount} membership(s) removed`,
    `${impact.scoringRunCount} scoring run(s)`,
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
  const memberships = await db.contactListMembership.findMany({
    where: { organizationId, contactListId },
    select: { contactId: true },
  });
  const contactIds = memberships.map((row) => row.contactId);
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
    contactCount: memberships.length,
    scoringRunCount,
    campaignCount: campaignIds.size,
    activeCampaignCount: activeCampaignIds.size,
    draftCount,
    sentCount,
  };
}

export function decideListDelete(impact: ListLifecycleImpact): ListDeleteDecision {
  // Campaign attachment is informational only — list delete never cascades
  // into CampaignContact / drafts / sends.
  if (impact.scoringRunCount > 0) {
    return {
      mode: "archive",
      impact,
      message: `List archived because ${impact.scoringRunCount} scoring run(s) reference it. Contacts and campaign history were preserved.`,
    };
  }
  return {
    mode: "delete",
    impact,
    message: `List deleted. Removed ${impact.contactCount} membership(s). Contacts were kept.`,
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

  // Memberships only — do not delete Contact / CampaignContact / drafts / sends.
  await tx.contactListMembership.deleteMany({
    where: { organizationId, contactListId },
  });

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

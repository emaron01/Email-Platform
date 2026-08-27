import "server-only";

import { prisma } from "@/lib/prisma";
import { cadenceUrgency, isDue } from "@/lib/cadence/engine";
import type { CadenceUrgency } from "@/lib/cadence/engine";

export type DueContactRow = {
  campaignContactId: string;
  campaignId: string;
  campaignName: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  company: string | null;
  nextDueAt: Date;
  urgency: CadenceUrgency;
  sentCount: number;
  nextSequenceNumber: number;
  hasDraft: boolean;
};

export type CampaignDueSummary = {
  campaignId: string;
  campaignName: string;
  overdue: number;
  today: number;
  thisWeek: number;
  dueContacts: DueContactRow[];
};

export async function getDueContactsForUser(input: {
  organizationId: string;
  userId: string;
  includeArchived?: boolean;
}): Promise<CampaignDueSummary[]> {
  const now = new Date();
  const rows = await prisma.campaignContact.findMany({
    where: {
      organizationId: input.organizationId,
      nextDueAt: { not: null },
      sequenceStoppedAt: null,
      status: { not: "EXCLUDED" },
      campaign: input.includeArchived ? {} : { archivedAt: null },
    },
    select: {
      id: true,
      nextDueAt: true,
      campaign: { select: { id: true, name: true } },
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          company: true,
        },
      },
      emailDrafts: {
        select: {
          sequenceNumber: true,
          status: true,
        },
      },
    },
    orderBy: { nextDueAt: "asc" },
  });

  const dueRows: DueContactRow[] = [];
  for (const row of rows) {
    if (!row.nextDueAt || !isDue(row.nextDueAt, now)) continue;
    const sentCount = row.emailDrafts.filter(
      (draft) => draft.status === "SENT",
    ).length;
    const nextSequenceNumber = sentCount + 1;
    const hasDraft = row.emailDrafts.some(
      (draft) =>
        draft.sequenceNumber === nextSequenceNumber &&
        (draft.status === "DRAFT" ||
          draft.status === "APPROVED" ||
          draft.status === "SENDING"),
    );
    const contactName =
      [row.contact.firstName, row.contact.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      row.contact.email ||
      "Unnamed contact";
    dueRows.push({
      campaignContactId: row.id,
      campaignId: row.campaign.id,
      campaignName: row.campaign.name,
      contactId: row.contact.id,
      contactName,
      contactEmail: row.contact.email,
      company: row.contact.company,
      nextDueAt: row.nextDueAt,
      urgency: cadenceUrgency(row.nextDueAt, now),
      sentCount,
      nextSequenceNumber,
      hasDraft,
    });
  }

  const byCampaign = new Map<string, CampaignDueSummary>();
  for (const due of dueRows) {
    const existing = byCampaign.get(due.campaignId) ?? {
      campaignId: due.campaignId,
      campaignName: due.campaignName,
      overdue: 0,
      today: 0,
      thisWeek: 0,
      dueContacts: [],
    };
    if (due.urgency === "overdue") existing.overdue += 1;
    else if (due.urgency === "today") existing.today += 1;
    else if (due.urgency === "this_week") existing.thisWeek += 1;
    existing.dueContacts.push(due);
    byCampaign.set(due.campaignId, existing);
  }

  return [...byCampaign.values()].sort((a, b) => {
    const aScore = a.overdue * 1000 + a.today * 100 + a.thisWeek;
    const bScore = b.overdue * 1000 + b.today * 100 + b.thisWeek;
    return bScore - aScore;
  });
}

export async function countDueContactsForUser(input: {
  organizationId: string;
}): Promise<number> {
  const now = new Date();
  const count = await prisma.campaignContact.count({
    where: {
      organizationId: input.organizationId,
      nextDueAt: { lte: now },
      sequenceStoppedAt: null,
      status: { not: "EXCLUDED" },
      campaign: { archivedAt: null },
    },
  });
  return count;
}

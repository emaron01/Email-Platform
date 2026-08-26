/**
 * Collapse duplicate Contact rows that share (organizationId, normalizedEmail)
 * into one Contact + ContactListMembership rows.
 *
 * Preview mode reports what would merge without writing.
 * Apply mode writes ContactMergeAudit in its own commit BEFORE remapping /
 * deleting losers, so audits persist independently of delete work and of
 * Prisma migration transactions.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeContactEmail } from "@/lib/contact/identity";

type Db = PrismaClient | Prisma.TransactionClient;

export type CollapseFieldMerge = {
  field: string;
  fromLoser: unknown;
  intoWinner: unknown;
  kept: "winner" | "loser";
};

export type CollapseGroupPreview = {
  organizationId: string;
  normalizedEmail: string;
  winnerContactId: string;
  loserContactIds: string[];
  contactIds: string[];
  listIds: string[];
  /** What apply would write for each loser (field decisions + loser snapshot). */
  proposedMerges: Array<{
    loserContactId: string;
    loserSnapshot: {
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      title: string | null;
      company: string | null;
      companyId: string | null;
    };
    fieldMerges: CollapseFieldMerge[];
  }>;
};

export type CollapsePreviewReport = {
  organizationId: string | null;
  totalContacts: number;
  contactsWithEmail: number;
  emailLessContacts: number;
  duplicateGroupCount: number;
  contactsThatWouldMergeAway: number;
  groups: CollapseGroupPreview[];
};

function pickWinner<T extends { id: string; createdAt: Date }>(rows: T[]): T {
  return [...rows].sort((a, b) => {
    const byDate = a.createdAt.getTime() - b.createdAt.getTime();
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  })[0]!;
}

export async function previewContactCollapse(
  db: Db,
  options?: { organizationId?: string },
): Promise<CollapsePreviewReport> {
  const where = options?.organizationId
    ? { organizationId: options.organizationId }
    : {};
  const contacts = await db.contact.findMany({
    where,
    select: {
      id: true,
      organizationId: true,
      email: true,
      normalizedEmail: true,
      createdAt: true,
      firstName: true,
      lastName: true,
      title: true,
      previousTitle: true,
      titleChangedAt: true,
      company: true,
      companyWebsite: true,
      industry: true,
      employeeCount: true,
      revenue: true,
      location: true,
      linkedinUrl: true,
      phone: true,
      companyId: true,
      rawData: true,
      memberships: { select: { contactListId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const byKey = new Map<string, typeof contacts>();
  let emailLess = 0;
  for (const contact of contacts) {
    const normalized =
      contact.normalizedEmail ?? normalizeContactEmail(contact.email);
    if (!normalized) {
      emailLess += 1;
      continue;
    }
    const key = `${contact.organizationId}::${normalized}`;
    const bucket = byKey.get(key) ?? [];
    bucket.push(contact);
    byKey.set(key, bucket);
  }

  const groups: CollapseGroupPreview[] = [];
  for (const [key, rows] of byKey) {
    if (rows.length < 2) continue;
    const [organizationId, normalizedEmail] = key.split("::") as [
      string,
      string,
    ];
    const winner = pickWinner(rows);
    const losers = rows.filter((row) => row.id !== winner.id);
    const listIds = Array.from(
      new Set(
        rows.flatMap((row) =>
          row.memberships.map((membership) => membership.contactListId),
        ),
      ),
    );
    // Simulate sequential incoming-non-null merges for preview accuracy.
    let rolling = { ...winner } as MergeContact;
    const proposedMerges: CollapseGroupPreview["proposedMerges"] = [];
    for (const loser of losers) {
      const { data, merges } = mergeScalarFields(rolling, loser as MergeContact);
      proposedMerges.push({
        loserContactId: loser.id,
        loserSnapshot: {
          id: loser.id,
          email: loser.email,
          firstName: loser.firstName,
          lastName: loser.lastName,
          title: loser.title,
          company: loser.company,
          companyId: loser.companyId,
        },
        fieldMerges: merges,
      });
      rolling = {
        ...rolling,
        ...(data.title !== undefined ? { title: String(data.title) } : {}),
        ...(data.previousTitle !== undefined
          ? { previousTitle: String(data.previousTitle) }
          : {}),
        ...(data.firstName !== undefined
          ? { firstName: data.firstName as string | null }
          : {}),
        ...(data.lastName !== undefined
          ? { lastName: data.lastName as string | null }
          : {}),
        ...(data.company !== undefined
          ? { company: data.company as string | null }
          : {}),
      };
    }
    groups.push({
      organizationId,
      normalizedEmail,
      winnerContactId: winner.id,
      loserContactIds: losers.map((row) => row.id),
      contactIds: rows.map((row) => row.id),
      listIds,
      proposedMerges,
    });
  }

  return {
    organizationId: options?.organizationId ?? null,
    totalContacts: contacts.length,
    contactsWithEmail: contacts.length - emailLess,
    emailLessContacts: emailLess,
    duplicateGroupCount: groups.length,
    contactsThatWouldMergeAway: groups.reduce(
      (sum, group) => sum + group.loserContactIds.length,
      0,
    ),
    groups,
  };
}

type MergeContact = {
  id: string;
  organizationId: string;
  email: string | null;
  normalizedEmail: string | null;
  createdAt: Date;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  previousTitle: string | null;
  titleChangedAt: Date | null;
  company: string | null;
  companyWebsite: string | null;
  industry: string | null;
  employeeCount: number | null;
  revenue: Prisma.Decimal | null;
  location: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  companyId: string | null;
  rawData: Prisma.JsonValue | null;
};

function mergeScalarFields(
  winner: MergeContact,
  loser: MergeContact,
): { data: Prisma.ContactUpdateInput; merges: CollapseFieldMerge[] } {
  const data: Prisma.ContactUpdateInput = {};
  const merges: CollapseFieldMerge[] = [];
  const now = new Date();

  const takeLoser = (
    field: keyof MergeContact,
    options?: { title?: boolean },
  ) => {
    const fromLoser = loser[field];
    const intoWinner = winner[field];
    if (fromLoser == null || fromLoser === "") return;
    if (intoWinner != null && intoWinner !== "") {
      if (options?.title) {
        if (fromLoser === intoWinner) {
          merges.push({
            field: "title",
            fromLoser,
            intoWinner,
            kept: "winner",
          });
          return;
        }
        data.previousTitle = String(intoWinner);
        data.titleChangedAt = now;
        data.title = String(fromLoser);
        merges.push({
          field: "title",
          fromLoser,
          intoWinner,
          kept: "loser",
        });
        merges.push({
          field: "previousTitle",
          fromLoser: intoWinner,
          intoWinner: winner.previousTitle,
          kept: "loser",
        });
        return;
      }
      // Incoming (loser) non-null wins for every other scalar field.
      (data as Record<string, unknown>)[field as string] = fromLoser;
      merges.push({
        field: String(field),
        fromLoser,
        intoWinner,
        kept: "loser",
      });
      return;
    }
    (data as Record<string, unknown>)[field as string] = fromLoser;
    merges.push({
      field: String(field),
      fromLoser,
      intoWinner,
      kept: "loser",
    });
  };

  takeLoser("firstName");
  takeLoser("lastName");
  takeLoser("title", { title: true });
  takeLoser("company");
  takeLoser("companyWebsite");
  takeLoser("industry");
  takeLoser("employeeCount");
  takeLoser("revenue");
  takeLoser("location");
  takeLoser("linkedinUrl");
  takeLoser("phone");
  takeLoser("rawData");
  if (loser.companyId && loser.companyId !== winner.companyId) {
    data.companyRecord = { connect: { id: loser.companyId } };
    merges.push({
      field: "companyId",
      fromLoser: loser.companyId,
      intoWinner: winner.companyId,
      kept: "loser",
    });
  }

  return { data, merges };
}

async function remapLoserToWinner(
  tx: Prisma.TransactionClient,
  winner: MergeContact,
  loser: MergeContact,
): Promise<void> {
  const loserMemberships = await tx.contactListMembership.findMany({
    where: { contactId: loser.id },
  });
  for (const membership of loserMemberships) {
    await tx.contactListMembership.upsert({
      where: {
        contactListId_contactId: {
          contactListId: membership.contactListId,
          contactId: winner.id,
        },
      },
      create: {
        organizationId: membership.organizationId,
        contactListId: membership.contactListId,
        contactId: winner.id,
        addedAt: membership.addedAt,
        addedByUserId: membership.addedByUserId,
      },
      update: {},
    });
  }
  await tx.contactListMembership.deleteMany({
    where: { contactId: loser.id },
  });

  const loserCampaignContacts = await tx.campaignContact.findMany({
    where: { contactId: loser.id },
  });
  for (const cc of loserCampaignContacts) {
    const existing = await tx.campaignContact.findFirst({
      where: {
        organizationId: cc.organizationId,
        campaignId: cc.campaignId,
        contactId: winner.id,
      },
    });
    if (existing) {
      // Move drafts one-by-one so (campaignContactId, sequenceNumber) stays unique.
      const loserDrafts = await tx.emailDraft.findMany({
        where: { campaignContactId: cc.id },
      });
      for (const draft of loserDrafts) {
        const conflict = await tx.emailDraft.findFirst({
          where: {
            organizationId: draft.organizationId,
            campaignContactId: existing.id,
            sequenceNumber: draft.sequenceNumber,
          },
        });
        if (!conflict) {
          await tx.emailDraft.update({
            where: { id: draft.id },
            data: { campaignContactId: existing.id },
          });
          await tx.emailSendRecord.updateMany({
            where: { emailDraftId: draft.id },
            data: { campaignContactId: existing.id },
          });
          continue;
        }
        // Prefer keeping a SENT draft; otherwise keep the survivor's existing draft.
        const preferLoserDraft =
          draft.status === "SENT" && conflict.status !== "SENT";
        const keep = preferLoserDraft ? draft : conflict;
        const drop = preferLoserDraft ? conflict : draft;

        if (preferLoserDraft) {
          // Make room: move winner draft's replies/sends onto loser draft, then
          // re-point loser draft at the surviving CampaignContact.
          await tx.emailDraft.updateMany({
            where: { inReplyToDraftId: drop.id },
            data: { inReplyToDraftId: keep.id },
          });
          await tx.emailSendRecord.updateMany({
            where: { emailDraftId: drop.id },
            data: {
              emailDraftId: keep.id,
              campaignContactId: existing.id,
            },
          });
          await tx.emailDraft.delete({ where: { id: drop.id } });
          await tx.emailDraft.update({
            where: { id: keep.id },
            data: { campaignContactId: existing.id },
          });
          await tx.emailSendRecord.updateMany({
            where: { emailDraftId: keep.id },
            data: { campaignContactId: existing.id },
          });
        } else {
          await tx.emailDraft.updateMany({
            where: { inReplyToDraftId: drop.id },
            data: { inReplyToDraftId: keep.id },
          });
          await tx.emailSendRecord.updateMany({
            where: { emailDraftId: drop.id },
            data: {
              emailDraftId: keep.id,
              campaignContactId: existing.id,
            },
          });
          await tx.emailDraft.delete({ where: { id: drop.id } });
        }
      }
      await tx.emailSendRecord.updateMany({
        where: { campaignContactId: cc.id },
        data: { campaignContactId: existing.id },
      });
      await tx.campaignContact.delete({ where: { id: cc.id } });
    } else {
      await tx.campaignContact.update({
        where: { id: cc.id },
        data: { contactId: winner.id },
      });
    }
  }

  const loserScores = await tx.contactScore.findMany({
    where: { contactId: loser.id },
  });
  for (const score of loserScores) {
    const existing = await tx.contactScore.findFirst({
      where: {
        scoringRunId: score.scoringRunId,
        contactId: winner.id,
      },
    });
    if (existing) {
      const preferLoser =
        score.scoringStatus === "COMPLETED" &&
        existing.scoringStatus !== "COMPLETED";
      if (preferLoser) {
        await tx.contactScore.delete({ where: { id: existing.id } });
        await tx.contactScore.update({
          where: { id: score.id },
          data: { contactId: winner.id },
        });
      } else {
        await tx.contactScore.delete({ where: { id: score.id } });
      }
    } else {
      await tx.contactScore.update({
        where: { id: score.id },
        data: { contactId: winner.id },
      });
    }
  }

  const loserResearch = await tx.contactResearch.findMany({
    where: { contactId: loser.id },
  });
  let winnerResearch = await tx.contactResearch.findFirst({
    where: { contactId: winner.id },
  });
  for (const research of loserResearch) {
    if (!winnerResearch) {
      await tx.contactResearch.update({
        where: { id: research.id },
        data: { contactId: winner.id },
      });
      winnerResearch = { ...research, contactId: winner.id };
    } else {
      const preferLoser =
        (research.confidence === "HIGH" &&
          winnerResearch.confidence !== "HIGH") ||
        (research.status === "COMPLETED" &&
          winnerResearch.status !== "COMPLETED");
      if (preferLoser) {
        await tx.contactResearch.delete({
          where: { id: winnerResearch.id },
        });
        await tx.contactResearch.update({
          where: { id: research.id },
          data: { contactId: winner.id },
        });
        winnerResearch = { ...research, contactId: winner.id };
      } else {
        await tx.contactResearch.delete({ where: { id: research.id } });
      }
    }
  }

  await tx.contact.delete({ where: { id: loser.id } });
}

export async function applyContactCollapse(
  db: PrismaClient,
  options?: { organizationId?: string },
): Promise<CollapsePreviewReport> {
  // Do not bulk-write normalizedEmail before merge: when a unique index already
  // exists, updating losers first would violate (organizationId, normalizedEmail).
  // Preview groups via email fallback when normalizedEmail is null.
  const preview = await previewContactCollapse(db, options);

  for (const group of preview.groups) {
    const rows = await db.contact.findMany({
      where: {
        id: { in: group.contactIds },
        organizationId: group.organizationId,
      },
    });
    if (rows.length < 2) continue;
    const winner = pickWinner(rows) as MergeContact;
    const losers = rows.filter((row) => row.id !== winner.id) as MergeContact[];

    if (!winner.normalizedEmail && group.normalizedEmail) {
      const updatedWinner = await db.contact.update({
        where: { id: winner.id },
        data: { normalizedEmail: group.normalizedEmail },
      });
      Object.assign(winner, updatedWinner);
    }

    for (const loser of losers) {
      const { data, merges } = mergeScalarFields(winner, loser);

      // Commit audit BEFORE any remap/delete so it survives if later work fails.
      await db.contactMergeAudit.create({
        data: {
          organizationId: group.organizationId,
          winnerContactId: winner.id,
          loserContactId: loser.id,
          normalizedEmail: group.normalizedEmail,
          mergePayload: {
            loserSnapshot: {
              id: loser.id,
              email: loser.email,
              firstName: loser.firstName,
              lastName: loser.lastName,
              title: loser.title,
              company: loser.company,
              companyId: loser.companyId,
            },
            fieldMerges: merges,
          } as Prisma.InputJsonValue,
        },
      });

      await db.$transaction(async (tx) => {
        if (Object.keys(data).length > 0) {
          const updated = await tx.contact.update({
            where: { id: winner.id },
            data,
          });
          Object.assign(winner, updated);
        }
        await remapLoserToWinner(tx, winner, loser);
      });
    }
  }

  return previewContactCollapse(db, options);
}

/**
 * Send-queue order for the campaign email draft contact list:
 * unsent with draft, unsent without draft, then fully sent — stable within each group.
 */
export function contactHasUnsentEmailWork(contact: {
  drafts: Array<{ status: string }>;
}): boolean {
  if (contact.drafts.length === 0) return true;
  return contact.drafts.some((draft) => draft.status !== "SENT");
}

function contactHasReviewableUnsentDraft(contact: {
  drafts: Array<{ status: string; subject?: string; body?: string }>;
}): boolean {
  return contact.drafts.some(
    (draft) =>
      draft.status !== "SENT" && Boolean(draft.subject?.trim() && draft.body?.trim()),
  );
}

export type SendQueueContact = {
  campaignContactId: string;
  contactStatus: string;
  suppressed: boolean;
  sequenceStopped?: boolean;
  drafts: Array<{ status: string; subject?: string; body?: string }>;
};

export function isSendQueueActionable(contact: SendQueueContact): boolean {
  if (contact.suppressed) return false;
  if (contact.contactStatus === "EXCLUDED") return false;
  if (contact.sequenceStopped) return false;
  return contactHasUnsentEmailWork(contact);
}

export function sortEmailDraftContactsForSendQueue<
  T extends { drafts: Array<{ status: string; subject?: string; body?: string }> },
>(contacts: readonly T[]): T[] {
  const unsentWithDraft: T[] = [];
  const unsentWithoutDraft: T[] = [];
  const sent: T[] = [];
  for (const contact of contacts) {
    if (!contactHasUnsentEmailWork(contact)) {
      sent.push(contact);
      continue;
    }
    if (contactHasReviewableUnsentDraft(contact)) {
      unsentWithDraft.push(contact);
    } else {
      unsentWithoutDraft.push(contact);
    }
  }
  return [...unsentWithDraft, ...unsentWithoutDraft, ...sent];
}

/** Next contact after a send, following the current visible sort order. */
export function pickNextContactAfterSend<T extends SendQueueContact>(
  orderedContacts: readonly T[],
  currentCampaignContactId: string,
): T | null {
  const currentIndex = orderedContacts.findIndex(
    (contact) => contact.campaignContactId === currentCampaignContactId,
  );
  if (currentIndex < 0) return null;
  for (let index = currentIndex + 1; index < orderedContacts.length; index += 1) {
    const contact = orderedContacts[index];
    if (isSendQueueActionable(contact)) return contact;
  }
  return null;
}

export const CAMPAIGN_QUEUE_COMPLETE_MESSAGE =
  "All contacts in this campaign have been emailed.";

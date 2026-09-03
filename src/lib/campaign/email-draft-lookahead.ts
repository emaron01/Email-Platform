import { contactHasUnsentEmailWork } from "@/lib/campaign/email-draft-contact-order";

/** Tunable look-ahead depth — single source of truth. */
export const LOOKAHEAD_DRAFT_COUNT = 2;

export type LookaheadContact = {
  campaignContactId: string;
  contactStatus: string;
  suppressed: boolean;
  sequenceStopped: boolean;
  hasPersonaDecision: boolean;
  drafts: Array<{
    sequenceNumber: number;
    subject: string;
    body: string;
    status: string;
    source?: string;
    generationQuotaCommitted?: boolean;
  }>;
};

export function isLookaheadEligible(contact: LookaheadContact): boolean {
  if (contact.suppressed) return false;
  if (contact.contactStatus === "EXCLUDED") return false;
  if (contact.sequenceStopped) return false;
  if (!contact.hasPersonaDecision) return false;
  if (!contactHasUnsentEmailWork(contact)) return false;
  if (contact.drafts.some((draft) => draft.subject && draft.body)) return false;
  return true;
}

export function pickLookaheadContacts<T extends LookaheadContact>(
  orderedContacts: readonly T[],
  currentCampaignContactId: string,
  count: number = LOOKAHEAD_DRAFT_COUNT,
): T[] {
  const startIndex = orderedContacts.findIndex(
    (contact) => contact.campaignContactId === currentCampaignContactId,
  );
  if (startIndex < 0) return [];

  const picked: T[] = [];
  for (
    let index = startIndex + 1;
    index < orderedContacts.length && picked.length < count;
    index += 1
  ) {
    const contact = orderedContacts[index];
    if (isLookaheadEligible(contact)) picked.push(contact);
  }
  return picked;
}

export function contactHasUncommittedLookaheadDraft(contact: {
  drafts: Array<{
    source?: string;
    generationQuotaCommitted?: boolean;
    subject?: string;
    body?: string;
  }>;
}): boolean {
  return contact.drafts.some(
    (draft) =>
      draft.source === "AI_LOOKAHEAD" &&
      draft.generationQuotaCommitted === false &&
      Boolean(draft.subject && draft.body),
  );
}

export function contactDraftListStatus(input: {
  isPreparing: boolean;
  hasPersonaDecision?: boolean;
  drafts: Array<{
    subject: string;
    body: string;
    status: string;
    sequenceNumber?: number;
    sentAt?: string | null;
    source?: string;
    generationQuotaCommitted?: boolean;
  }>;
}): string {
  if (input.isPreparing) return "Preparing…";
  const reviewable = input.drafts.filter(
    (draft) => draft.subject && draft.body && draft.status !== "SENT",
  );
  if (reviewable.length > 0) {
    if (contactHasUncommittedLookaheadDraft({ drafts: reviewable })) {
      return "Prepared";
    }
    return "Ready to review";
  }
  if (input.hasPersonaDecision === false) {
    return "Needs persona";
  }

  const sent = input.drafts
    .filter((draft) => draft.status === "SENT")
    .sort((a, b) => (b.sequenceNumber ?? 0) - (a.sequenceNumber ?? 0));
  const latestSent = sent[0];
  if (latestSent) {
    const sequence = latestSent.sequenceNumber ?? sent.length;
    if (latestSent.sentAt) {
      const sentDate = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(new Date(latestSent.sentAt));
      return `Email ${sequence} sent ${sentDate}`;
    }
    return `Email ${sequence} sent`;
  }

  return "No draft";
}

/** Contact list line: qualification · optional persona · draft/send status. */
export function formatEmailDraftContactListLine(input: {
  qualificationLabel: string;
  personaName?: string | null;
  statusLabel: string;
}): string {
  const parts = [input.qualificationLabel];
  const persona = input.personaName?.trim();
  if (persona) parts.push(persona);
  parts.push(input.statusLabel);
  return parts.join(" · ");
}

/**
 * Send-queue order for the campaign email draft contact list:
 * no draft / any unsent draft first, fully sent contacts last.
 * Stable within each group (preserves incoming order).
 */
export function contactHasUnsentEmailWork(contact: {
  drafts: Array<{ status: string }>;
}): boolean {
  if (contact.drafts.length === 0) return true;
  return contact.drafts.some((draft) => draft.status !== "SENT");
}

export function sortEmailDraftContactsForSendQueue<
  T extends { drafts: Array<{ status: string }> },
>(contacts: readonly T[]): T[] {
  const unsent: T[] = [];
  const sent: T[] = [];
  for (const contact of contacts) {
    if (contactHasUnsentEmailWork(contact)) unsent.push(contact);
    else sent.push(contact);
  }
  return [...unsent, ...sent];
}

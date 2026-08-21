import { normalizeEmail } from "@/lib/import/validate";
import type { PreparedContact } from "@/lib/import/types";

export type ExistingContactKey = {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
};

function nameCompanyKey(
  firstName: string | null,
  lastName: string | null,
  company: string | null,
): string | null {
  const first = (firstName ?? "").trim().toLowerCase();
  const last = (lastName ?? "").trim().toLowerCase();
  const org = (company ?? "").trim().toLowerCase();
  if (!first && !last) return null;
  if (!org) return null;
  return `${first}|${last}|${org}`;
}

export function buildDuplicateIndexes(existing: ExistingContactKey[]) {
  const emails = new Set<string>();
  const nameCompany = new Set<string>();

  for (const row of existing) {
    const email = normalizeEmail(row.email);
    if (email) emails.add(email);

    const key = nameCompanyKey(row.firstName, row.lastName, row.company);
    if (key) nameCompany.add(key);
  }

  return { emails, nameCompany };
}

export function isDuplicateContact(
  contact: PreparedContact,
  indexes: ReturnType<typeof buildDuplicateIndexes>,
): boolean {
  const email = normalizeEmail(contact.email);
  if (email && indexes.emails.has(email)) {
    return true;
  }

  if (!email) {
    const key = nameCompanyKey(
      contact.firstName,
      contact.lastName,
      contact.company,
    );
    if (key && indexes.nameCompany.has(key)) {
      return true;
    }
  }

  return false;
}

export function findDuplicateRows(
  contacts: PreparedContact[],
  existing: ExistingContactKey[],
): number[] {
  const indexes = buildDuplicateIndexes(existing);
  const duplicateIndexes: number[] = [];

  // Also detect duplicates within the incoming batch
  const batchEmails = new Set<string>();
  const batchNameCompany = new Set<string>();

  contacts.forEach((contact, index) => {
    const againstExisting = isDuplicateContact(contact, indexes);
    const email = normalizeEmail(contact.email);
    let againstBatch = false;

    if (email) {
      if (batchEmails.has(email)) againstBatch = true;
      else batchEmails.add(email);
    } else {
      const key = nameCompanyKey(
        contact.firstName,
        contact.lastName,
        contact.company,
      );
      if (key) {
        if (batchNameCompany.has(key)) againstBatch = true;
        else batchNameCompany.add(key);
      }
    }

    if (againstExisting || againstBatch) {
      duplicateIndexes.push(index);
    }
  });

  return duplicateIndexes;
}

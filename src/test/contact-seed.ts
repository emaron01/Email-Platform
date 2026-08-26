/**
 * Test-only helpers for Contact + ContactListMembership seeding.
 * Domain words belong in fixtures only — keep helper itself vocabulary-free.
 */
import type { Contact, Prisma, PrismaClient } from "@prisma/client";
import { normalizeContactEmail } from "@/lib/contact/identity";

type Db = PrismaClient | Prisma.TransactionClient;

export type SeedContactInput = {
  organizationId: string;
  contactListId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  company?: string | null;
  companyWebsite?: string | null;
  industry?: string | null;
  employeeCount?: number | null;
  location?: string | null;
  companyId?: string | null;
  rawData?: Prisma.InputJsonValue;
};

/** Create a Contact and membership on the given list. */
export async function seedContactOnList(
  db: Db,
  input: SeedContactInput,
): Promise<Contact> {
  const normalizedEmail = normalizeContactEmail(input.email ?? null);
  const data: Prisma.ContactUncheckedCreateInput = {
    organizationId: input.organizationId,
    normalizedEmail,
  };
  if (input.email !== undefined) data.email = input.email;
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.title !== undefined) data.title = input.title;
  if (input.company !== undefined) data.company = input.company;
  if (input.companyWebsite !== undefined) {
    data.companyWebsite = input.companyWebsite;
  }
  if (input.industry !== undefined) data.industry = input.industry;
  if (input.employeeCount !== undefined) {
    data.employeeCount = input.employeeCount;
  }
  if (input.location !== undefined) data.location = input.location;
  if (input.companyId !== undefined) data.companyId = input.companyId;
  if (input.rawData !== undefined) data.rawData = input.rawData;

  const contact = await db.contact.create({ data });
  await db.contactListMembership.create({
    data: {
      organizationId: input.organizationId,
      contactListId: input.contactListId,
      contactId: contact.id,
    },
  });
  return contact;
}

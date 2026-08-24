import "server-only";

import type {
  Campaign,
  CampaignStatus,
  Contact,
  ContactList,
  ContactScore,
  EmailLength,
  Icp,
  Offer,
  Persona,
  Product,
  Prisma,
  ResearchStatus,
  ScoreLabel,
  ScoringRun,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  snapshotIcp,
  snapshotPersona,
  snapshotProduct,
} from "@/lib/scoring/snapshots";
import { requireOrganizationId, TenantError } from "@/lib/tenant/getCurrentOrganization";
import {
  deletePersonaAssistedSetupGraph,
  deleteProductAssistedSetupGraph,
} from "@/lib/tenant/product-persona-delete";

async function orgId(): Promise<string> {
  return requireOrganizationId();
}

function notFound(entity: string): never {
  throw new TenantError(`${entity} not found in the active organization.`);
}

// --- Products ---

export type ProductWithCounts = Product & {
  _count: { icps: number; personas: number; campaigns: number };
};

export async function listProducts(): Promise<Product[]> {
  const organizationId = await orgId();
  return prisma.product.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function listProductsWithCounts(): Promise<ProductWithCounts[]> {
  const organizationId = await orgId();
  return prisma.product.findMany({
    where: { organizationId, archivedAt: null },
    include: {
      _count: {
        select: {
          icps: true,
          personas: true,
          campaigns: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProduct(id: string): Promise<Product> {
  const organizationId = await orgId();
  const product = await prisma.product.findFirst({
    where: { id, organizationId, archivedAt: null },
  });
  if (!product) notFound("Product");
  return product;
}

export async function createProduct(
  data: Omit<Prisma.ProductUncheckedCreateInput, "organizationId" | "id">,
): Promise<Product> {
  const organizationId = await orgId();
  return prisma.product.create({
    data: { ...data, organizationId },
  });
}

export async function updateProduct(
  id: string,
  data: Prisma.ProductUncheckedUpdateInput,
): Promise<Product> {
  const organizationId = await orgId();
  const existing = await prisma.product.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!existing) notFound("Product");

  return prisma.product.update({
    where: { id },
    data: {
      ...data,
      organizationId,
    },
  });
}

export async function deleteProduct(id: string): Promise<{
  mode: "deleted" | "archived";
  message: string;
}> {
  const organizationId = await orgId();
  const existing = await prisma.product.findFirst({
    where: { id, organizationId, archivedAt: null },
    include: {
      _count: {
        select: {
          icps: true,
          personas: true,
          campaigns: true,
          scoringRuns: true,
          sources: true,
          evidenceBundles: true,
          setupRuns: true,
        },
      },
    },
  });
  if (!existing) notFound("Product");

  if (existing._count.campaigns > 0) {
    throw new TenantError(
      `Product could not be deleted because it is still referenced by ${existing._count.campaigns} campaign(s). Remove or reassign those campaigns first.`,
    );
  }

  // Historical scoring snapshots must remain — soft-archive when ScoringRuns exist.
  if (existing._count.scoringRuns > 0) {
    const now = new Date();
    await prisma.$transaction([
      prisma.product.update({
        where: { id: existing.id },
        data: { archivedAt: now },
      }),
      prisma.persona.updateMany({
        where: { organizationId, productId: existing.id, archivedAt: null },
        data: { archivedAt: now },
      }),
      prisma.icp.updateMany({
        where: { organizationId, productId: existing.id, archivedAt: null },
        data: { archivedAt: now },
      }),
    ]);
    return {
      mode: "archived",
      message: `Product archived because ${existing._count.scoringRuns} scoring run(s) reference it. Historical scoring snapshots were preserved. The product no longer appears in setup.`,
    };
  }

  // Hard delete live setup graph in FK-safe order (no ScoringRun/Campaign refs).
  // PersonaSetupRun.productEvidenceBundleId is Restrict — cleared inside
  // deleteProductAssistedSetupGraph before ProductEvidenceBundle.
  await prisma.$transaction(async (tx) => {
    await deleteProductAssistedSetupGraph(tx, organizationId, existing.id);

    // Personas (criteria Cascade; PersonaSource Cascade when personaId set)
    await tx.personaCriterion.deleteMany({
      where: {
        organizationId,
        persona: { productId: existing.id },
      },
    });
    await tx.persona.deleteMany({
      where: { organizationId, productId: existing.id },
    });

    await tx.icpCriterion.deleteMany({
      where: {
        organizationId,
        icp: { productId: existing.id },
      },
    });
    await tx.icp.deleteMany({
      where: { organizationId, productId: existing.id },
    });
    await tx.product.delete({ where: { id: existing.id } });
  });

  return {
    mode: "deleted",
    message: "Product deleted.",
  };
}

async function requireProductInOrg(productId: string): Promise<Product> {
  const organizationId = await orgId();
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId, archivedAt: null },
  });
  if (!product) {
    throw new TenantError("Product does not belong to the active organization.");
  }
  return product;
}

// --- Offers (legacy table retained; not used by Setup UX) ---

export async function listOffers(): Promise<Offer[]> {
  const organizationId = await orgId();
  return prisma.offer.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}

// --- ICPs ---

export async function listIcps(productId?: string): Promise<Icp[]> {
  const organizationId = await orgId();
  if (productId) {
    await requireProductInOrg(productId);
  }
  return prisma.icp.findMany({
    where: {
      organizationId,
      archivedAt: null,
      ...(productId ? { productId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getIcp(id: string): Promise<Icp> {
  const organizationId = await orgId();
  const icp = await prisma.icp.findFirst({
    where: { id, organizationId },
  });
  if (!icp) notFound("ICP");
  return icp;
}

export async function createIcp(
  data: Omit<Prisma.IcpUncheckedCreateInput, "organizationId" | "id"> & {
    productId: string;
  },
): Promise<Icp> {
  const organizationId = await orgId();
  const product = await requireProductInOrg(data.productId);

  return prisma.icp.create({
    data: {
      ...data,
      organizationId,
      productId: product.id,
    },
  });
}

export async function updateIcp(
  id: string,
  data: Prisma.IcpUncheckedUpdateInput,
): Promise<Icp> {
  const organizationId = await orgId();
  const existing = await prisma.icp.findFirst({
    where: { id, organizationId },
  });
  if (!existing) notFound("ICP");

  // productId reassignment is not allowed via update payload from clients
  const { productId: _ignored, ...safeData } = data as Prisma.IcpUncheckedUpdateInput & {
    productId?: unknown;
  };

  return prisma.icp.update({
    where: { id },
    data: {
      ...safeData,
      organizationId,
      productId: existing.productId,
    },
  });
}

export async function deleteIcp(id: string): Promise<{
  mode: "deleted" | "archived";
  message: string;
}> {
  const organizationId = await orgId();
  const existing = await prisma.icp.findFirst({
    where: { id, organizationId, archivedAt: null },
    include: {
      _count: { select: { campaigns: true, scoringRuns: true } },
    },
  });
  if (!existing) notFound("ICP");

  if (existing._count.campaigns > 0) {
    throw new TenantError(
      `ICP could not be deleted because it is still referenced by ${existing._count.campaigns} campaign(s).`,
    );
  }

  if (existing._count.scoringRuns > 0) {
    await prisma.icp.update({
      where: { id: existing.id },
      data: { archivedAt: new Date() },
    });
    return {
      mode: "archived",
      message: `ICP archived because ${existing._count.scoringRuns} scoring run(s) reference it. Historical snapshots were preserved.`,
    };
  }

  await prisma.icp.delete({ where: { id: existing.id } });
  return { mode: "deleted", message: "ICP deleted." };
}

// --- Personas ---

export async function listPersonas(productId?: string): Promise<Persona[]> {
  const organizationId = await orgId();
  if (productId) {
    await requireProductInOrg(productId);
  }
  return prisma.persona.findMany({
    where: {
      organizationId,
      archivedAt: null,
      ...(productId ? { productId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPersona(id: string): Promise<Persona> {
  const organizationId = await orgId();
  const persona = await prisma.persona.findFirst({
    where: { id, organizationId, archivedAt: null },
  });
  if (!persona) notFound("Persona");
  return persona;
}

export async function createPersona(
  data: Omit<Prisma.PersonaUncheckedCreateInput, "organizationId" | "id"> & {
    productId: string;
  },
): Promise<Persona> {
  const organizationId = await orgId();
  const product = await requireProductInOrg(data.productId);

  return prisma.persona.create({
    data: {
      ...data,
      organizationId,
      productId: product.id,
    },
  });
}

export async function updatePersona(
  id: string,
  data: Prisma.PersonaUncheckedUpdateInput,
): Promise<Persona> {
  const organizationId = await orgId();
  const existing = await prisma.persona.findFirst({
    where: { id, organizationId },
  });
  if (!existing) notFound("Persona");

  const { productId: _ignored, ...safeData } = data as Prisma.PersonaUncheckedUpdateInput & {
    productId?: unknown;
  };

  return prisma.persona.update({
    where: { id },
    data: {
      ...safeData,
      organizationId,
      productId: existing.productId,
    },
  });
}

export async function deletePersona(id: string): Promise<{
  mode: "deleted" | "archived";
  message: string;
}> {
  const organizationId = await orgId();
  const existing = await prisma.persona.findFirst({
    where: { id, organizationId, archivedAt: null },
    include: {
      _count: {
        select: { campaigns: true, scoringRuns: true, criteria: true },
      },
    },
  });
  if (!existing) notFound("Persona");

  if (existing._count.campaigns > 0) {
    throw new TenantError(
      `Persona could not be deleted because it is still referenced by ${existing._count.campaigns} campaign(s). Remove or reassign those campaigns first.`,
    );
  }

  // ScoringRun.personaId is Restrict — preserve immutable history via soft-archive.
  if (existing._count.scoringRuns > 0) {
    await prisma.persona.update({
      where: { id: existing.id },
      data: { archivedAt: new Date() },
    });
    return {
      mode: "archived",
      message: `Persona archived because ${existing._count.scoringRuns} scoring run(s) reference it. Historical scoring snapshots were not changed. The persona no longer appears in setup.`,
    };
  }

  // Hard delete: clear persona research graph, then Persona (criteria Cascade;
  // PersonaSource rows with personaId Cascade). PersonaEvidenceBundle is
  // Product-scoped — delete only bundles for this Persona's setup runs.
  await prisma.$transaction(async (tx) => {
    await deletePersonaAssistedSetupGraph(tx, organizationId, existing.id);
    await tx.persona.delete({ where: { id: existing.id } });
  });

  return {
    mode: "deleted",
    message: "Persona deleted.",
  };
}

// --- Contact lists ---

export async function listContactLists(): Promise<ContactList[]> {
  const organizationId = await orgId();
  return prisma.contactList.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getContactList(id: string): Promise<ContactList> {
  const organizationId = await orgId();
  const list = await prisma.contactList.findFirst({
    where: { id, organizationId },
  });
  if (!list) notFound("Contact list");
  return list;
}

export async function getContactListContacts(
  listId: string,
  options?: { page?: number; pageSize?: number },
): Promise<{
  contacts: Contact[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const organizationId = await orgId();
  const list = await prisma.contactList.findFirst({
    where: { id: listId, organizationId },
    select: { id: true },
  });
  if (!list) notFound("Contact list");

  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 50));
  const skip = (page - 1) * pageSize;

  const [total, contacts] = await Promise.all([
    prisma.contact.count({
      where: { organizationId, contactListId: listId },
    }),
    prisma.contact.findMany({
      where: { organizationId, contactListId: listId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { createdAt: "asc" }],
      skip,
      take: pageSize,
    }),
  ]);

  return { contacts, total, page, pageSize };
}

export async function findExistingContactsForDuplicateCheck(): Promise<
  Array<{
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
  }>
> {
  const organizationId = await orgId();
  return prisma.contact.findMany({
    where: { organizationId },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      company: true,
    },
  });
}

export type ImportContactInput = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  company: string | null;
  companyWebsite: string | null;
  industry: string | null;
  employeeCount: number | null;
  revenue: number | null;
  location: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  rawData: Record<string, string>;
};

export async function importContactList(input: {
  name: string;
  sourceType: "PASTE" | "UPLOAD";
  originalFilename?: string | null;
  contacts: ImportContactInput[];
}): Promise<{ listId: string; importedCount: number }> {
  const organizationId = await orgId();
  const name = input.name.trim();

  if (!name) {
    throw new TenantError("List name is required.");
  }
  if (input.contacts.length === 0) {
    throw new TenantError("No contacts to import.");
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const list = await tx.contactList.create({
        data: {
          organizationId,
          name,
          sourceType: input.sourceType,
          originalFilename: input.originalFilename?.trim() || null,
          totalContacts: 0,
        },
      });

      // Create in chunks to keep transactions manageable
      const chunkSize = 500;
      let created = 0;

      for (let i = 0; i < input.contacts.length; i += chunkSize) {
        const chunk = input.contacts.slice(i, i + chunkSize);
        const createdChunk = await tx.contact.createMany({
          data: chunk.map((contact) => ({
            organizationId,
            contactListId: list.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            title: contact.title,
            company: contact.company,
            companyWebsite: contact.companyWebsite,
            industry: contact.industry,
            employeeCount: contact.employeeCount,
            revenue: contact.revenue,
            location: contact.location,
            linkedinUrl: contact.linkedinUrl,
            phone: contact.phone,
            rawData: contact.rawData,
          })),
        });
        created += createdChunk.count;
      }

      await tx.contactList.update({
        where: { id: list.id },
        data: { totalContacts: created },
      });

      return { listId: list.id, importedCount: created };
    });

    return result;
  } catch (error) {
    console.error("importContactList failed", error);
    throw new TenantError("Import failed. No partial list was left behind.");
  }
}

// --- Contacts ---

export type ContactWithLatestScore = Contact & {
  scores: Array<{
    overallScore: number | null;
    scoreLabel: string | null;
  }>;
  contactList?: { id: string; name: string } | null;
};

export async function listContacts(options?: {
  listId?: string;
  search?: string;
}): Promise<ContactWithLatestScore[]> {
  const organizationId = await orgId();
  const listId = options?.listId?.trim() || undefined;
  const search = options?.search?.trim() || undefined;

  if (listId) {
    const list = await prisma.contactList.findFirst({
      where: { id: listId, organizationId },
      select: { id: true },
    });
    if (!list) notFound("Contact list");
  }

  return prisma.contact.findMany({
    where: {
      organizationId,
      ...(listId ? { contactListId: listId } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { company: { contains: search, mode: "insensitive" } },
              { title: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      scores: {
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          overallScore: true,
          scoreLabel: true,
        },
      },
      contactList: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

// --- Campaigns ---

export type CampaignWithRelations = Campaign & {
  product: { id: string; name: string };
  icp: { id: string; name: string };
  persona: { id: string; name: string };
  offer: { id: string; name: string } | null;
  _count: { contacts: number };
};

export async function listCampaigns(): Promise<CampaignWithRelations[]> {
  const organizationId = await orgId();
  return prisma.campaign.findMany({
    where: { organizationId },
    include: {
      product: { select: { id: true, name: true } },
      icp: { select: { id: true, name: true } },
      persona: { select: { id: true, name: true } },
      offer: { select: { id: true, name: true } },
      _count: { select: { contacts: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createCampaign(input: {
  name: string;
  productId: string;
  icpId: string;
  personaId: string;
  offerName?: string | null;
  offerDescription?: string | null;
  offerCta?: string | null;
  offerNotes?: string | null;
  offerValidationJson?: Prisma.InputJsonValue | null;
  offerValidationHash?: string | null;
  offerConflictAcknowledgedHash?: string | null;
  offerConflictAcknowledgedAt?: Date | null;
  emailLength?: EmailLength;
  emailGuidance?: string | null;
  contactIds?: string[];
  status?: CampaignStatus;
}): Promise<Campaign> {
  const organizationId = await orgId();

  const [product, icp, persona] = await Promise.all([
    prisma.product.findFirst({
      where: { id: input.productId, organizationId },
      select: { id: true, organizationId: true },
    }),
    prisma.icp.findFirst({
      where: { id: input.icpId, organizationId },
      select: { id: true, organizationId: true, productId: true },
    }),
    prisma.persona.findFirst({
      where: { id: input.personaId, organizationId },
      select: { id: true, organizationId: true, productId: true },
    }),
  ]);

  if (!product) {
    throw new TenantError("Product does not belong to the active organization.");
  }
  if (!icp) {
    throw new TenantError("ICP does not belong to the active organization.");
  }
  if (!persona) {
    throw new TenantError("Persona does not belong to the active organization.");
  }
  if (icp.productId !== product.id) {
    throw new TenantError("ICP does not belong to the selected product.");
  }
  if (persona.productId !== product.id) {
    throw new TenantError("Persona does not belong to the selected product.");
  }

  const contactIds = Array.from(
    new Set((input.contactIds ?? []).map((id) => id.trim()).filter(Boolean)),
  );

  if (contactIds.length > 0) {
    const contacts = await prisma.contact.findMany({
      where: {
        organizationId,
        id: { in: contactIds },
      },
      select: { id: true },
    });
    if (contacts.length !== contactIds.length) {
      throw new TenantError(
        "One or more selected contacts do not belong to the active organization.",
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        organizationId,
        name: input.name,
        productId: product.id,
        icpId: icp.id,
        personaId: persona.id,
        offerId: null,
        offerName: input.offerName?.trim() || null,
        offerDescription: input.offerDescription?.trim() || null,
        offerCta: input.offerCta?.trim() || null,
        offerNotes: input.offerNotes?.trim() || null,
        offerValidationJson: input.offerValidationJson ?? undefined,
        offerValidationHash: input.offerValidationHash ?? null,
        offerConflictAcknowledgedHash:
          input.offerConflictAcknowledgedHash ?? null,
        offerConflictAcknowledgedAt:
          input.offerConflictAcknowledgedAt ?? null,
        emailLength: input.emailLength ?? "MEDIUM",
        emailGuidance: input.emailGuidance?.trim() || null,
        status: input.status ?? "DRAFT",
      },
    });

    if (contactIds.length > 0) {
      await tx.campaignContact.createMany({
        data: contactIds.map((contactId) => ({
          organizationId,
          campaignId: campaign.id,
          contactId,
          selected: true,
          status: "SELECTED",
        })),
      });
    }

    return campaign;
  });
}

export async function assertContactBelongsToOrg(contactId: string): Promise<void> {
  const organizationId = await orgId();
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    select: { id: true },
  });
  if (!contact) {
    throw new TenantError("Contact does not belong to the active organization.");
  }
}

export async function assertCampaignBelongsToOrg(campaignId: string): Promise<void> {
  const organizationId = await orgId();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: { id: true },
  });
  if (!campaign) {
    throw new TenantError("Campaign does not belong to the active organization.");
  }
}

// --- Scoring ---

export type ScoringRunWithRelations = ScoringRun & {
  contactList: { id: string; name: string };
  product: { id: string; name: string };
  icp: { id: string; name: string };
  persona: { id: string; name: string };
};

export async function listScoringRunsForList(
  contactListId: string,
): Promise<ScoringRunWithRelations[]> {
  const organizationId = await orgId();
  const list = await prisma.contactList.findFirst({
    where: { id: contactListId, organizationId },
    select: { id: true },
  });
  if (!list) notFound("Contact list");

  return prisma.scoringRun.findMany({
    where: { organizationId, contactListId },
    include: {
      contactList: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
      icp: { select: { id: true, name: true } },
      persona: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getScoringRun(runId: string): Promise<ScoringRunWithRelations> {
  const organizationId = await orgId();
  const run = await prisma.scoringRun.findFirst({
    where: { id: runId, organizationId },
    include: {
      contactList: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
      icp: { select: { id: true, name: true } },
      persona: { select: { id: true, name: true } },
    },
  });
  if (!run) notFound("Scoring run");
  return run;
}

export async function createScoringRun(input: {
  contactListId: string;
  productId: string;
  icpId: string;
  personaId: string;
}): Promise<ScoringRun> {
  const organizationId = await orgId();

  const [list, product, icp, persona] = await Promise.all([
    prisma.contactList.findFirst({
      where: { id: input.contactListId, organizationId },
    }),
    prisma.product.findFirst({
      where: { id: input.productId, organizationId },
    }),
    prisma.icp.findFirst({
      where: { id: input.icpId, organizationId },
    }),
    prisma.persona.findFirst({
      where: { id: input.personaId, organizationId },
    }),
  ]);

  if (!list) {
    throw new TenantError("Contact list does not belong to the active organization.");
  }
  if (!product) {
    throw new TenantError("Product does not belong to the active organization.");
  }
  if (!icp) {
    throw new TenantError("ICP does not belong to the active organization.");
  }
  if (!persona) {
    throw new TenantError("Persona does not belong to the active organization.");
  }
  if (icp.productId !== product.id) {
    throw new TenantError("ICP does not belong to the selected product.");
  }
  if (persona.productId !== product.id) {
    throw new TenantError("Persona does not belong to the selected product.");
  }

  const contacts = await prisma.contact.findMany({
    where: { organizationId, contactListId: list.id },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (contacts.length === 0) {
    throw new TenantError("This list has no contacts to score.");
  }

  // Best-effort company association before creating the run (tenant-scoped).
  const { associateContactsForList } = await import("@/lib/tenant/companies");
  await associateContactsForList(list.id);

  const {
    ensureIcpLegacyCriteriaBackfilled,
    ensurePersonaLegacyCriteriaBackfilled,
  } = await import("@/lib/criteria/legacy-backfill");
  const { snapshotCriterionRow } = await import("@/lib/scoring/snapshots");

  await Promise.all([
    ensureIcpLegacyCriteriaBackfilled(organizationId, icp.id),
    ensurePersonaLegacyCriteriaBackfilled(organizationId, persona.id),
  ]);

  const [icpCriteriaRows, personaCriteriaRows] = await Promise.all([
    prisma.icpCriterion.findMany({
      where: { organizationId, icpId: icp.id },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.personaCriterion.findMany({
      where: { organizationId, personaId: persona.id },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const icpCriteria = icpCriteriaRows.map(snapshotCriterionRow);
  const personaCriteria = personaCriteriaRows.map(snapshotCriterionRow);

  return prisma.$transaction(async (tx) => {
    const run = await tx.scoringRun.create({
      data: {
        organizationId,
        contactListId: list.id,
        productId: product.id,
        icpId: icp.id,
        personaId: persona.id,
        status: "PENDING",
        totalContacts: contacts.length,
        scoredContacts: 0,
        productSnapshot: snapshotProduct(product),
        icpSnapshot: snapshotIcp(icp, icpCriteria) as Prisma.InputJsonValue,
        personaSnapshot: snapshotPersona(persona, personaCriteria) as Prisma.InputJsonValue,
      },
    });

    // Placeholder score rows only — no fabricated scores.
    await tx.contactScore.createMany({
      data: contacts.map((contact) => ({
        organizationId,
        contactId: contact.id,
        scoringRunId: run.id,
        scoringStatus: "PENDING",
        researchStatus: "NOT_STARTED",
      })),
    });

    return run;
  });
}

export type ScoreReportSort =
  | "overallScore"
  | "icpScore"
  | "personaScore"
  | "companyScore"
  | "productRelevanceScore"
  | "company"
  | "name";

export type ScoreReportFilters = {
  scoreLabel?: ScoreLabel | "";
  minOverallScore?: number | null;
  company?: string;
  researchStatus?: ResearchStatus | "";
  sort?: ScoreReportSort;
  sortDir?: "asc" | "desc";
};

export type ScoreReportRow = ContactScore & {
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    title: string | null;
    company: string | null;
    companyId: string | null;
    companyRecord: {
      id: string;
      name: string;
      website: string | null;
      normalizedDomain: string | null;
      research: Array<{
        id: string;
        status: import("@prisma/client").CompanyResearchStatus;
        researchMethod: import("@prisma/client").ResearchMethod;
        researchConfidence: import("@prisma/client").ResearchConfidence | null;
        companySummary: string | null;
        whatTheySell: string | null;
        estimatedAov: string | null;
        aovReasoning: string | null;
        customerTypes: unknown;
        primaryMarkets: unknown;
        businessModel: string | null;
        companySizeContext: string | null;
        relevantTechnologies: unknown;
        buyingSignals: unknown;
        riskSignals: unknown;
        researchSources: unknown;
        researchedAt: Date | null;
      }>;
    } | null;
  };
};

export async function getScoreReportRows(
  runId: string,
  filters: ScoreReportFilters = {},
): Promise<ScoreReportRow[]> {
  const organizationId = await orgId();
  const run = await prisma.scoringRun.findFirst({
    where: { id: runId, organizationId },
    select: { id: true },
  });
  if (!run) notFound("Scoring run");

  const sort = filters.sort ?? "name";
  const sortDir = filters.sortDir ?? "asc";

  const rows = await prisma.contactScore.findMany({
    where: {
      organizationId,
      scoringRunId: runId,
      ...(filters.scoreLabel ? { scoreLabel: filters.scoreLabel } : {}),
      ...(filters.researchStatus
        ? { researchStatus: filters.researchStatus }
        : {}),
      ...(filters.minOverallScore != null
        ? { overallScore: { gte: filters.minOverallScore } }
        : {}),
      ...(filters.company?.trim()
        ? {
            contact: {
              company: {
                contains: filters.company.trim(),
                mode: "insensitive",
              },
            },
          }
        : {}),
    },
    include: {
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          title: true,
          company: true,
          companyId: true,
          companyRecord: {
            select: {
              id: true,
              name: true,
              website: true,
              normalizedDomain: true,
              research: {
                orderBy: { updatedAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  status: true,
                  researchMethod: true,
                  researchConfidence: true,
                  companySummary: true,
                  whatTheySell: true,
                  estimatedAov: true,
                  aovReasoning: true,
                  customerTypes: true,
                  primaryMarkets: true,
                  businessModel: true,
                  companySizeContext: true,
                  relevantTechnologies: true,
                  buyingSignals: true,
                  riskSignals: true,
                  researchSources: true,
                  researchedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const sorted = [...rows].sort((a, b) => {
    const dir = sortDir === "desc" ? -1 : 1;
    const scoreCmp = (left: number | null, right: number | null) => {
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      return (left - right) * dir;
    };

    switch (sort) {
      case "overallScore":
        return scoreCmp(a.overallScore, b.overallScore);
      case "icpScore":
        return scoreCmp(a.icpScore, b.icpScore);
      case "personaScore":
        return scoreCmp(a.personaScore, b.personaScore);
      case "companyScore":
        return scoreCmp(a.companyScore, b.companyScore);
      case "productRelevanceScore":
        return scoreCmp(a.productRelevanceScore, b.productRelevanceScore);
      case "company": {
        const left = (a.contact.company ?? "").toLowerCase();
        const right = (b.contact.company ?? "").toLowerCase();
        return left.localeCompare(right) * dir;
      }
      case "name":
      default: {
        const left = `${a.contact.lastName ?? ""} ${a.contact.firstName ?? ""}`
          .trim()
          .toLowerCase();
        const right = `${b.contact.lastName ?? ""} ${b.contact.firstName ?? ""}`
          .trim()
          .toLowerCase();
        return left.localeCompare(right) * dir;
      }
    }
  });

  return sorted;
}

// --- Dashboard metrics ---

export type DashboardMetrics = {
  totalLists: number;
  totalContacts: number;
  contactsScored: number;
  scoringRuns: number;
  activeCampaigns: number;
  draftEmails: number;
  emailsSent: number;
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const organizationId = await orgId();

  const [
    totalLists,
    totalContacts,
    contactsScored,
    scoringRuns,
    activeCampaigns,
    draftEmails,
    emailsSent,
  ] = await Promise.all([
    prisma.contactList.count({ where: { organizationId } }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.contactScore.count({
      where: {
        organizationId,
        overallScore: { not: null },
      },
    }),
    prisma.scoringRun.count({ where: { organizationId } }),
    prisma.campaign.count({
      where: { organizationId, status: "ACTIVE" },
    }),
    prisma.emailDraft.count({
      where: { organizationId, status: "DRAFT" },
    }),
    prisma.emailDraft.count({
      where: { organizationId, status: "SENT" },
    }),
  ]);

  return {
    totalLists,
    totalContacts,
    contactsScored,
    scoringRuns,
    activeCampaigns,
    draftEmails,
    emailsSent,
  };
}

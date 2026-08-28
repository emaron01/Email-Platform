import "server-only";

import type {
  Company,
  CompanyResearch,
  CompanyResearchStatus,
  Prisma,
  ResearchConfidence,
  ResearchMethod,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  domainFromEmail,
  isResearchFresh,
  needsResearchRefresh,
  normalizeCompanyName,
  normalizeDomain,
  normalizeWebsiteUrl,
  parseStringArray,
  researchExpiresAt,
  getCompanyResearchProvider,
  UnconfiguredCompanyResearchProvider,
  RESEARCH_CONCURRENCY,
  type CompanyResearchResult,
  type CompanyResearchProvenance,
  type ResearchSource,
  type AutomatedCompanyResearchResult,
} from "@/lib/research";
import { isResearchAiConfigured } from "@/lib/ai/config";
import { AiConfigError } from "@/lib/ai/errors";
import { getCurrentUser } from "@/lib/org/authz";
import { isDevTenantBypassEnabled } from "@/lib/auth/config";
import { recordUsageEvent } from "@/lib/usage/events";
import {
  companyHasActiveResearchSlot,
  countActiveResearchedCompanies,
} from "@/lib/usage/active-companies";
import { getResearchPolicy } from "@/lib/usage/policy";
import {
  assertUsageAllowed,
  UsageQuotaError,
} from "@/lib/usage/quota";
import {
  requireOrganizationId,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";

async function orgId(): Promise<string> {
  return requireOrganizationId();
}

function notFound(entity: string): never {
  throw new TenantError(`${entity} not found in the active organization.`);
}

export type CompanyIdentityInput = {
  name?: string | null;
  website?: string | null;
  email?: string | null;
  industry?: string | null;
  employeeCount?: number | null;
  revenue?: number | null;
  location?: string | null;
};

export async function getCompany(id: string): Promise<
  Company & { research: CompanyResearch[] }
> {
  const organizationId = await orgId();
  const company = await prisma.company.findFirst({
    where: { id, organizationId },
    include: {
      research: {
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!company) notFound("Company");
  return company;
}

export async function findCompanyByIdentity(
  input: CompanyIdentityInput,
): Promise<Company | null> {
  const organizationId = await orgId();
  const domain =
    normalizeDomain(input.website) ?? domainFromEmail(input.email);
  const normalizedName = normalizeCompanyName(input.name);

  if (domain) {
    const byDomain = await prisma.company.findFirst({
      where: { organizationId, normalizedDomain: domain },
    });
    if (byDomain) return byDomain;
  }

  if (normalizedName) {
    return prisma.company.findFirst({
      where: { organizationId, normalizedName },
    });
  }

  return null;
}

/**
 * Resolve an existing Company or create one. Tenant-scoped.
 * Matching: normalizedDomain first, then exact normalizedName.
 */
export async function resolveOrCreateCompany(
  input: CompanyIdentityInput,
): Promise<Company | null> {
  const organizationId = await orgId();
  const domain =
    normalizeDomain(input.website) ?? domainFromEmail(input.email);
  const normalizedName = normalizeCompanyName(input.name);
  const displayName = input.name?.trim() || domain || null;

  if (!displayName || (!domain && !normalizedName)) {
    return null;
  }

  const existing = await findCompanyByIdentity(input);
  if (existing) {
    const updates: Prisma.CompanyUpdateInput = {};
    if (!existing.website && input.website) {
      updates.website = normalizeWebsiteUrl(input.website) ?? existing.website;
    }
    if (!existing.normalizedDomain && domain) {
      updates.normalizedDomain = domain;
    }
    if (!existing.industry && input.industry) {
      updates.industry = input.industry;
    }
    if (existing.employeeCount == null && input.employeeCount != null) {
      updates.employeeCount = input.employeeCount;
    }
    if (existing.revenue == null && input.revenue != null) {
      updates.revenue = input.revenue;
    }
    if (!existing.location && input.location) {
      updates.location = input.location;
    }
    if (Object.keys(updates).length > 0) {
      return prisma.company.update({
        where: { id: existing.id },
        data: updates,
      });
    }
    return existing;
  }

  try {
    return await prisma.company.create({
      data: {
        organizationId,
        name: displayName,
        normalizedName: normalizedName ?? displayName.toLowerCase(),
        website: normalizeWebsiteUrl(input.website) ?? (domain ? `https://${domain}` : null),
        normalizedDomain: domain,
        industry: input.industry ?? null,
        employeeCount: input.employeeCount ?? null,
        revenue: input.revenue ?? null,
        location: input.location ?? null,
      },
    });
  } catch (error) {
    // Concurrent create on same domain — re-read
    const again = await findCompanyByIdentity(input);
    if (again) return again;
    throw error;
  }
}

export async function associateContactWithCompany(
  contactId: string,
): Promise<Company | null> {
  const organizationId = await orgId();
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
  });
  if (!contact) notFound("Contact");

  if (contact.companyId) {
    const existing = await prisma.company.findFirst({
      where: { id: contact.companyId, organizationId },
    });
    if (existing) return existing;
  }

  const company = await resolveOrCreateCompany({
    name: contact.company,
    website: contact.companyWebsite,
    email: contact.email,
    industry: contact.industry,
    employeeCount: contact.employeeCount,
    revenue: contact.revenue != null ? Number(contact.revenue) : null,
    location: contact.location,
  });

  if (!company) return null;

  await prisma.contact.update({
    where: { id: contact.id },
    data: { companyId: company.id },
  });

  return company;
}

export async function associateContactsForList(
  contactListId: string,
): Promise<{ contactsProcessed: number; companiesLinked: number }> {
  const organizationId = await orgId();
  const list = await prisma.contactList.findFirst({
    where: { id: contactListId, organizationId },
    select: { id: true },
  });
  if (!list) notFound("Contact list");

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId,
      archivedAt: null,
      memberships: { some: { contactListId } },
    },
  });

  const companyIds = new Set<string>();
  const identityCache = new Map<string, Company | null>();

  for (const contact of contacts) {
    if (contact.companyId) {
      const existing = await prisma.company.findFirst({
        where: { id: contact.companyId, organizationId },
        select: { id: true },
      });
      if (existing) {
        companyIds.add(existing.id);
        continue;
      }
    }

    const domain =
      normalizeDomain(contact.companyWebsite) ??
      domainFromEmail(contact.email);
    const normalizedName = normalizeCompanyName(contact.company);
    const cacheKey = `${domain ?? ""}::${normalizedName ?? ""}`;

    let company = identityCache.get(cacheKey);
    if (company === undefined) {
      company = await resolveOrCreateCompany({
        name: contact.company,
        website: contact.companyWebsite,
        email: contact.email,
        industry: contact.industry,
        employeeCount: contact.employeeCount,
        revenue: contact.revenue != null ? Number(contact.revenue) : null,
        location: contact.location,
      });
      identityCache.set(cacheKey, company);
    }

    if (!company) continue;

    if (contact.companyId !== company.id) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { companyId: company.id },
      });
    }
    companyIds.add(company.id);
  }

  return {
    contactsProcessed: contacts.length,
    companiesLinked: companyIds.size,
  };
}

export type LatestCompanyResearch = CompanyResearch | null;

export async function getLatestCompanyResearch(
  companyId: string,
): Promise<LatestCompanyResearch> {
  const organizationId = await orgId();
  const company = await prisma.company.findFirst({
    where: { id: companyId, organizationId },
    select: { id: true },
  });
  if (!company) notFound("Company");

  return prisma.companyResearch.findFirst({
    where: { organizationId, companyId },
    orderBy: { updatedAt: "desc" },
  });
}

export type ResearchPlanItem = {
  companyId: string;
  companyName: string;
  normalizedDomain: string | null;
  reason: "missing" | "stale" | "failed" | "low_confidence" | "fresh";
  latestResearch: CompanyResearch | null;
};

export type ResearchStatusCounts = {
  completed: number;
  partial: number;
  failed: number;
  notStarted: number;
  inProgress: number;
};

export type ResearchPlanSummary = {
  totalContacts: number;
  uniqueCompanies: number;
  alreadyResearched: number;
  needingResearch: number;
  statusCounts: ResearchStatusCounts;
  items: ResearchPlanItem[];
};

/**
 * Attach a Contact to a Company only when both belong to the active org.
 */
export async function setContactCompany(
  contactId: string,
  companyId: string,
): Promise<void> {
  const organizationId = await orgId();
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    select: { id: true },
  });
  if (!contact) notFound("Contact");

  const company = await prisma.company.findFirst({
    where: { id: companyId, organizationId },
    select: { id: true },
  });
  if (!company) {
    throw new TenantError(
      "Company does not belong to the active organization.",
    );
  }

  await prisma.contact.update({
    where: { id: contact.id },
    data: { companyId: company.id },
  });
}

export async function getCompaniesNeedingResearchForContactList(
  contactListId: string,
): Promise<ResearchPlanSummary> {
  const organizationId = await orgId();
  const list = await prisma.contactList.findFirst({
    where: { id: contactListId, organizationId },
    select: { id: true },
  });
  if (!list) notFound("Contact list");

  await associateContactsForList(contactListId);

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId,
      archivedAt: null,
      memberships: { some: { contactListId } },
      companyId: { not: null },
    },
    select: {
      id: true,
      companyId: true,
      companyRecord: true,
    },
  });

  const byCompany = new Map<string, Company>();
  for (const contact of contacts) {
    if (contact.companyId && contact.companyRecord) {
      byCompany.set(contact.companyId, contact.companyRecord);
    }
  }

  const researchPolicy = await getResearchPolicy(organizationId);
  const freshnessDays = researchPolicy.researchFreshnessDays;

  const items: ResearchPlanItem[] = [];
  let alreadyResearched = 0;
  let needingResearch = 0;
  const statusCounts: ResearchStatusCounts = {
    completed: 0,
    partial: 0,
    failed: 0,
    notStarted: 0,
    inProgress: 0,
  };

  for (const [companyId, company] of byCompany) {
    const latest = await prisma.companyResearch.findFirst({
      where: { organizationId, companyId },
      orderBy: { updatedAt: "desc" },
    });

    let reason: ResearchPlanItem["reason"] = "missing";
    if (!latest) {
      reason = "missing";
      needingResearch += 1;
      statusCounts.notStarted += 1;
    } else if (latest.status === "FAILED") {
      reason = "failed";
      needingResearch += 1;
      statusCounts.failed += 1;
    } else if (latest.researchConfidence === "LOW") {
      reason = "low_confidence";
      needingResearch += 1;
      bumpStatusCount(statusCounts, latest.status);
    } else if (needsResearchRefresh(latest, new Date(), freshnessDays)) {
      reason = "stale";
      needingResearch += 1;
      bumpStatusCount(statusCounts, latest.status);
    } else if (isResearchFresh(latest, new Date(), freshnessDays)) {
      reason = "fresh";
      alreadyResearched += 1;
      bumpStatusCount(statusCounts, latest.status);
    } else {
      reason = "stale";
      needingResearch += 1;
      bumpStatusCount(statusCounts, latest.status);
    }

    items.push({
      companyId,
      companyName: company.name,
      normalizedDomain: company.normalizedDomain,
      reason,
      latestResearch: latest,
    });
  }

  const totalContacts = await prisma.contact.count({
    where: {
      organizationId,
      archivedAt: null,
      memberships: { some: { contactListId } },
    },
  });

  return {
    totalContacts,
    uniqueCompanies: byCompany.size,
    alreadyResearched,
    needingResearch,
    statusCounts,
    items,
  };
}

export async function getCompaniesNeedingResearchForScoringRun(
  scoringRunId: string,
): Promise<ResearchPlanSummary> {
  const organizationId = await orgId();
  const run = await prisma.scoringRun.findFirst({
    where: { id: scoringRunId, organizationId },
    select: { id: true, contactListId: true },
  });
  if (!run) notFound("Scoring run");

  return getCompaniesNeedingResearchForContactList(run.contactListId);
}

export type ContactListGroupContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
};

export type ContactListCompanyGroup = {
  companyId: string;
  companyName: string;
  website: string | null;
  industry: string | null;
  employeeCount: number | null;
  revenue: number | null;
  latestResearch: CompanyResearch | null;
  researchReason: ResearchPlanItem["reason"];
  contacts: ContactListGroupContact[];
};

export async function getContactListCompanyGroups(
  contactListId: string,
  options?: { page?: number; pageSize?: number },
): Promise<{
  groups: ContactListCompanyGroup[];
  totalCompanies: number;
  totalContacts: number;
  page: number;
  pageSize: number;
  showIndustry: boolean;
}> {
  const organizationId = await orgId();
  const list = await prisma.contactList.findFirst({
    where: { id: contactListId, organizationId },
    select: { id: true },
  });
  if (!list) notFound("Contact list");

  const [plan, contacts] = await Promise.all([
    getCompaniesNeedingResearchForContactList(contactListId),
    prisma.contact.findMany({
      where: {
        organizationId,
        archivedAt: null,
        memberships: { some: { contactListId } },
      },
      orderBy: [
        { lastName: "asc" },
        { firstName: "asc" },
        { createdAt: "asc" },
      ],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        title: true,
        companyId: true,
        company: true,
      },
    }),
  ]);

  const contactsByCompany = new Map<string, ContactListGroupContact[]>();
  const unlinkedContacts: ContactListGroupContact[] = [];

  for (const contact of contacts) {
    const row: ContactListGroupContact = {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      title: contact.title,
    };
    if (contact.companyId) {
      const existing = contactsByCompany.get(contact.companyId) ?? [];
      existing.push(row);
      contactsByCompany.set(contact.companyId, existing);
    } else {
      unlinkedContacts.push(row);
    }
  }

  const allGroups: ContactListCompanyGroup[] = plan.items
    .map((item) => ({
      companyId: item.companyId,
      companyName: item.companyName,
      website: item.normalizedDomain,
      industry: null as string | null,
      employeeCount: null as number | null,
      revenue: null as number | null,
      latestResearch: item.latestResearch,
      researchReason: item.reason,
      contacts: contactsByCompany.get(item.companyId) ?? [],
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName));

  // Need company record fields - fetch companies in one query
  const companyIds = allGroups.map((g) => g.companyId);
  const companies = await prisma.company.findMany({
    where: { organizationId, id: { in: companyIds } },
  });
  const companyById = new Map(companies.map((c) => [c.id, c]));

  for (const group of allGroups) {
    const company = companyById.get(group.companyId);
    if (company) {
      group.industry = company.industry;
      group.employeeCount = company.employeeCount;
      group.revenue =
        company.revenue != null ? Number(company.revenue) : null;
      group.website = company.normalizedDomain ?? company.website;
    }
  }

  if (unlinkedContacts.length > 0) {
    allGroups.push({
      companyId: "",
      companyName: "Unlinked contacts",
      website: null,
      industry: null,
      employeeCount: null,
      revenue: null,
      latestResearch: null,
      researchReason: "missing",
      contacts: unlinkedContacts,
    });
  }

  const showIndustry = allGroups.some(
    (group) => group.industry != null && group.industry.trim() !== "",
  );

  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options?.pageSize ?? 25));
  const totalCompanies = allGroups.length;
  const skip = (page - 1) * pageSize;
  const groups = allGroups.slice(skip, skip + pageSize);

  return {
    groups,
    totalCompanies,
    totalContacts: plan.totalContacts,
    page,
    pageSize,
    showIndustry,
  };
}

function bumpStatusCount(
  counts: ResearchStatusCounts,
  status: CompanyResearchStatus,
): void {
  switch (status) {
    case "COMPLETED":
      counts.completed += 1;
      break;
    case "PARTIAL":
      counts.partial += 1;
      break;
    case "FAILED":
      counts.failed += 1;
      break;
    case "IN_PROGRESS":
      counts.inProgress += 1;
      break;
    case "NOT_STARTED":
    default:
      counts.notStarted += 1;
      break;
  }
}

export async function saveCompanyResearch(input: {
  companyId: string;
  result: CompanyResearchResult;
  researchMethod?: ResearchMethod;
  status?: CompanyResearchStatus;
  provenance?: CompanyResearchProvenance | null;
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    webSearchCallCount?: number | null;
    researchDurationMs?: number | null;
  } | null;
  researchedByUserId?: string | null;
  freshnessDays?: number;
}): Promise<CompanyResearch> {
  const organizationId = await orgId();
  const company = await prisma.company.findFirst({
    where: { id: input.companyId, organizationId },
  });
  if (!company) notFound("Company");

  const researchPolicy =
    input.freshnessDays != null
      ? { researchFreshnessDays: input.freshnessDays }
      : await getResearchPolicy(organizationId);

  const now = new Date();
  const sources = input.result.sources ?? [];

  return prisma.companyResearch.create({
    data: {
      organizationId,
      companyId: company.id,
      status: input.status ?? "COMPLETED",
      researchMethod: input.researchMethod ?? "AUTOMATED",
      companySummary: input.result.companySummary,
      whatTheySell: input.result.whatTheySell,
      customerTypes: input.result.customerTypes,
      primaryMarkets: input.result.primaryMarkets,
      businessModel: input.result.businessModel,
      estimatedAov: input.result.estimatedAov,
      aovReasoning: input.result.aovReasoning,
      companySizeContext: input.result.companySizeContext,
      relevantTechnologies: input.result.relevantTechnologies,
      buyingSignals: input.result.buyingSignals,
      riskSignals: input.result.riskSignals,
      researchConfidence: input.result.confidence,
      sourceCount: sources.length,
      researchSources: sources,
      researchedAt: now,
      expiresAt: researchExpiresAt(now, researchPolicy.researchFreshnessDays),
      aiProvider: input.provenance?.aiProvider ?? null,
      aiModel: input.provenance?.aiModel ?? null,
      aiModelUrlIdentifier: input.provenance?.aiModelUrlIdentifier ?? null,
      promptVersion: input.provenance?.promptVersion ?? null,
      inputTokens: input.usage?.inputTokens ?? null,
      outputTokens: input.usage?.outputTokens ?? null,
      webSearchCallCount: input.usage?.webSearchCallCount ?? null,
      researchDurationMs: input.usage?.researchDurationMs ?? null,
      researchedByUserId: input.researchedByUserId ?? null,
    },
  });
}

function isSuccessfulResearch(
  research: CompanyResearch | null,
): research is CompanyResearch {
  if (!research) return false;
  return (
    (research.status === "COMPLETED" || research.status === "PARTIAL") &&
    Boolean(
      research.companySummary ||
        research.whatTheySell ||
        research.sourceCount > 0,
    )
  );
}

export async function researchCompany(
  companyId: string,
  options?: { force?: boolean },
): Promise<{
  skipped: boolean;
  reason?: string;
  research: CompanyResearch | null;
  refreshFailed?: boolean;
  quotaBlocked?: boolean;
}> {
  // Tenant ownership check BEFORE any external API spend.
  const organizationId = await orgId();
  const company = await prisma.company.findFirst({
    where: { id: companyId, organizationId },
  });
  if (!company) notFound("Company");

  const researchPolicy = await getResearchPolicy(organizationId);
  const user = await getCurrentUser();

  if (user && !user.emailVerifiedAt && !isDevTenantBypassEnabled()) {
    return {
      skipped: true,
      reason: "Verify your email address to continue with this action.",
      research: await getLatestCompanyResearch(company.id),
      quotaBlocked: true,
    };
  }

  const latest = await getLatestCompanyResearch(company.id);
  if (
    !options?.force &&
    latest &&
    isResearchFresh(latest, new Date(), researchPolicy.researchFreshnessDays)
  ) {
    // Fresh reusable research: access does not consume a new active-company slot
    // and does not create duplicate UsageEvents.
    return { skipped: true, reason: "fresh", research: latest };
  }

  const priorSuccessful = isSuccessfulResearch(latest) ? latest : null;
  const alreadyHasActiveSlot = await companyHasActiveResearchSlot(
    organizationId,
    company.id,
  );

  // Enforce active researched-company entitlement before external API spend.
  // Refresh / existing active slot does not consume a second slot.
  if (user) {
    try {
      await assertUsageAllowed({
        organizationId,
        userId: user.id,
        resource: "ACTIVE_RESEARCHED_COMPANY",
        wouldConsumeNewActiveCompanySlot: !alreadyHasActiveSlot,
        companyId: company.id,
      });
    } catch (error) {
      if (error instanceof UsageQuotaError) {
        return {
          skipped: true,
          reason: error.message,
          research: priorSuccessful ?? latest,
          quotaBlocked: true,
        };
      }
      throw error;
    }
  }

  const provider = getCompanyResearchProvider();

  // No fabrication: leave explicit pending state when Research AI is not configured.
  if (
    provider instanceof UnconfiguredCompanyResearchProvider ||
    !isResearchAiConfigured()
  ) {
    if (!latest) {
      const pending = await prisma.companyResearch.create({
        data: {
          organizationId,
          companyId: company.id,
          status: "NOT_STARTED",
          researchMethod: "AUTOMATED",
        },
      });
      return {
        skipped: true,
        reason: "provider_unconfigured",
        research: pending,
      };
    }
    return {
      skipped: true,
      reason: "provider_unconfigured",
      research: latest,
    };
  }

  try {
    const result = (await provider.research({
      organizationId,
      companyId: company.id,
      name: company.name,
      website: company.website,
      normalizedDomain: company.normalizedDomain,
      industry: company.industry,
      employeeCount: company.employeeCount,
      location: company.location,
      depthPolicy: researchPolicy,
    })) as CompanyResearchResult | AutomatedCompanyResearchResult;

    const provenance =
      "provenance" in result && result.provenance
        ? result.provenance
        : null;
    const usage =
      "usage" in result && result.usage ? result.usage : null;
    const identityAmbiguous =
      "identityAmbiguous" in result && Boolean(result.identityAmbiguous);

    const status: CompanyResearchStatus =
      identityAmbiguous ||
      (result.sources.length === 0 &&
        !result.companySummary &&
        !result.whatTheySell) ||
      (result.confidence === "LOW" && result.sources.length === 0)
        ? "PARTIAL"
        : "COMPLETED";

    const saved = await saveCompanyResearch({
      companyId: company.id,
      result,
      researchMethod: "AUTOMATED",
      status,
      provenance,
      usage,
      researchedByUserId: user?.id ?? null,
      freshnessDays: researchPolicy.researchFreshnessDays,
    });

    await recordUsageEvent({
      organizationId,
      userId: user?.id ?? null,
      category: "RESEARCH",
      operation: "RESEARCH_SYNTHESIS",
      provider: provenance?.aiProvider ?? null,
      model: provenance?.aiModel ?? null,
      companyId: company.id,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      webSearchCalls: usage?.webSearchCallCount ?? null,
      status: status === "PARTIAL" ? "PARTIAL" : "SUCCESS",
      durationMs: usage?.researchDurationMs ?? null,
      metadata: {
        forceRefresh: Boolean(options?.force),
        alreadyHadActiveSlot: alreadyHasActiveSlot,
        activeCompanyCountAfter: await countActiveResearchedCompanies(
          organizationId,
        ),
      },
    });

    return { skipped: false, research: saved };
  } catch (error) {
    if (error instanceof AiConfigError) {
      return {
        skipped: true,
        reason: "provider_unconfigured",
        research: priorSuccessful ?? latest,
      };
    }

    const message =
      error instanceof Error ? error.message : "Research provider failed.";

    await recordUsageEvent({
      organizationId,
      userId: user?.id ?? null,
      category: "RESEARCH",
      operation: "RESEARCH_SYNTHESIS",
      companyId: company.id,
      status: "FAILED",
      metadata: {
        forceRefresh: Boolean(options?.force),
        error: message.slice(0, 500),
      },
    });

    // Refresh safety: never replace prior successful research with a FAILED row.
    if (priorSuccessful) {
      return {
        skipped: false,
        reason: message,
        research: priorSuccessful,
        refreshFailed: true,
      };
    }

    await prisma.companyResearch.create({
      data: {
        organizationId,
        companyId: company.id,
        status: "FAILED",
        researchMethod: "AUTOMATED",
        companySummary: null,
        aovReasoning: message.slice(0, 2000),
        researchedAt: new Date(),
        researchedByUserId: user?.id ?? null,
      },
    });

    return {
      skipped: false,
      reason: message,
      research: await getLatestCompanyResearch(company.id),
      refreshFailed: true,
    };
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function run(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current]!);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run(),
  );
  await Promise.all(runners);
  return results;
}

export async function runResearchForContactList(
  contactListId: string,
  options?: { forceRefresh?: boolean },
): Promise<{
  attempted: number;
  skippedFresh: number;
  failed: number;
  completed: number;
  quotaBlocked: number;
  quotaBlockedCompanyNames: string[];
  allowance: {
    used: number;
    limit: number;
    remaining: number;
    exhausted: boolean;
  };
}> {
  const organizationId = await orgId();
  const plan = await getCompaniesNeedingResearchForContactList(contactListId);
  const user = await getCurrentUser();

  const targets = options?.forceRefresh
    ? plan.items
    : plan.items.filter((item) => item.reason !== "fresh");

  const refreshTargets: typeof targets = [];
  const newSlotTargets: typeof targets = [];
  for (const item of targets) {
    const hasSlot = await companyHasActiveResearchSlot(
      organizationId,
      item.companyId,
    );
    if (hasSlot) refreshTargets.push(item);
    else newSlotTargets.push(item);
  }

  let remainingSlots = Number.POSITIVE_INFINITY;
  let allowanceView = {
    used: 0,
    limit: 0,
    remaining: 0,
    exhausted: false,
  };
  if (user) {
    const { getActiveResearchedCompanyUsage } = await import("@/lib/usage/quota");
    const usage = await getActiveResearchedCompanyUsage({
      organizationId,
      userId: user.id,
    });
    remainingSlots = usage.remaining;
    allowanceView = {
      used: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
      exhausted: usage.exhausted,
    };
  }

  const allowedNew = newSlotTargets.slice(0, Math.max(0, remainingSlots));
  const blockedNew = newSlotTargets.slice(Math.max(0, remainingSlots));

  const results = await mapPool(
    [...refreshTargets, ...allowedNew],
    RESEARCH_CONCURRENCY,
    (item) =>
      researchCompany(item.companyId, {
        force: options?.forceRefresh,
      }),
  );

  let skippedFresh = 0;
  let failed = 0;
  let completed = 0;
  let quotaBlocked = blockedNew.length;
  const quotaBlockedCompanyNames = blockedNew.map((item) => item.companyName);

  for (const result of results) {
    if (result.quotaBlocked) {
      quotaBlocked += 1;
      continue;
    }
    if (result.skipped) {
      skippedFresh += 1;
      continue;
    }
    if (result.refreshFailed) {
      failed += 1;
      continue;
    }
    if (
      result.research?.status === "COMPLETED" ||
      result.research?.status === "PARTIAL"
    ) {
      completed += 1;
    } else if (result.research?.status === "FAILED") {
      failed += 1;
    }
  }

  if (user) {
    const { getActiveResearchedCompanyUsage } = await import("@/lib/usage/quota");
    const usage = await getActiveResearchedCompanyUsage({
      organizationId,
      userId: user.id,
    });
    allowanceView = {
      used: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
      exhausted: usage.exhausted,
    };
  }

  return {
    attempted: results.length + blockedNew.length,
    skippedFresh,
    failed,
    completed,
    quotaBlocked,
    quotaBlockedCompanyNames,
    allowance: allowanceView,
  };
}

export async function runResearchForScoringRun(
  scoringRunId: string,
  options?: { forceRefresh?: boolean },
): Promise<{
  attempted: number;
  skippedFresh: number;
  failed: number;
  completed: number;
  quotaBlocked: number;
  quotaBlockedCompanyNames: string[];
  allowance: {
    used: number;
    limit: number;
    remaining: number;
    exhausted: boolean;
  };
}> {
  const organizationId = await orgId();
  const run = await prisma.scoringRun.findFirst({
    where: { id: scoringRunId, organizationId },
    select: { contactListId: true },
  });
  if (!run) notFound("Scoring run");

  return runResearchForContactList(run.contactListId, options);
}

export async function updateManualCompanyResearch(input: {
  companyId: string;
  companySummary?: string | null;
  whatTheySell?: string | null;
  estimatedAov?: string | null;
  aovReasoning?: string | null;
  customerTypes?: string[];
  primaryMarkets?: string[];
  businessModel?: string | null;
  companySizeContext?: string | null;
  relevantTechnologies?: string[];
  buyingSignals?: string[];
  riskSignals?: string[];
  researchConfidence?: ResearchConfidence | null;
}): Promise<CompanyResearch> {
  const organizationId = await orgId();
  const company = await prisma.company.findFirst({
    where: { id: input.companyId, organizationId },
  });
  if (!company) notFound("Company");

  const latest = await getLatestCompanyResearch(company.id);
  const now = new Date();
  const researchPolicy = await getResearchPolicy(organizationId);
  const user = await getCurrentUser();
  const alreadyHasActiveSlot = await companyHasActiveResearchSlot(
    organizationId,
    company.id,
  );

  if (user && !alreadyHasActiveSlot) {
    try {
      await assertUsageAllowed({
        organizationId,
        userId: user.id,
        resource: "ACTIVE_RESEARCHED_COMPANY",
        wouldConsumeNewActiveCompanySlot: true,
        companyId: company.id,
      });
    } catch (error) {
      if (error instanceof UsageQuotaError) {
        throw new TenantError(error.message);
      }
      throw error;
    }
  }

  const data = {
    organizationId,
    companyId: company.id,
    status: "COMPLETED" as CompanyResearchStatus,
    researchMethod: (latest && latest.researchMethod !== "MANUAL"
      ? "HYBRID"
      : "MANUAL") as ResearchMethod,
    companySummary: input.companySummary?.trim() || null,
    whatTheySell: input.whatTheySell?.trim() || null,
    estimatedAov: input.estimatedAov?.trim() || null,
    aovReasoning: input.aovReasoning?.trim() || null,
    customerTypes: input.customerTypes ?? [],
    primaryMarkets: input.primaryMarkets ?? [],
    businessModel: input.businessModel?.trim() || null,
    companySizeContext: input.companySizeContext?.trim() || null,
    relevantTechnologies: input.relevantTechnologies ?? [],
    buyingSignals: input.buyingSignals ?? [],
    riskSignals: input.riskSignals ?? [],
    researchConfidence: input.researchConfidence ?? "MEDIUM",
    sourceCount: Array.isArray(latest?.researchSources)
      ? (latest?.researchSources as unknown[]).length
      : 0,
    researchSources: (latest?.researchSources as ResearchSource[] | null) ?? [],
    researchedAt: now,
    expiresAt: researchExpiresAt(now, researchPolicy.researchFreshnessDays),
  };

  return prisma.companyResearch.create({ data });
}

export function researchStatusLabel(
  status: CompanyResearchStatus | null | undefined,
): string {
  switch (status) {
    case "COMPLETED":
      return "Complete";
    case "PARTIAL":
      return "Partial";
    case "FAILED":
      return "Failed";
    case "IN_PROGRESS":
      return "In progress";
    case "NOT_STARTED":
    default:
      return "Not Started";
  }
}

export { parseStringArray, isResearchFresh, needsResearchRefresh };

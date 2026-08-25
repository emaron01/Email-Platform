import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeSuggestedBuyerRoles } from "@/lib/setup/product-overview";

export type SetupCardState = {
  done: boolean;
  label: string;
  detail: string;
  actionLabel: string;
  href: string;
};

export type HomeWorkflow = {
  setupComplete: boolean;
  completeProductIds: string[];
  product: SetupCardState & { suggestedRoleCount: number };
  icp: SetupCardState & {
    name: string | null;
    count: number;
    criterionCount: number;
    needsLookupCount: number;
  };
  personas: SetupCardState & { names: string[] };
  campaigns: Array<{
    id: string;
    name: string;
    context: string;
    companies: number;
    qualified: number;
    contacts: number;
    emailsToWrite: number;
  }>;
};

/** Criteria rows are the interpreted ICP. lastInterpretedAt is not required — legacy/manual backfill never sets it. */
function hasInterpretedCriteria(icp: { criteria: unknown[] }): boolean {
  return icp.criteria.length > 0;
}

export async function getHomeWorkflow(
  organizationId: string,
): Promise<HomeWorkflow> {
  const [products, campaigns] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        icps: {
          where: { archivedAt: null },
          orderBy: { createdAt: "asc" },
          include: {
            criteria: {
              select: {
                evidenceClass: true,
                targetedSearchDecision: true,
              },
            },
          },
        },
        personas: {
          where: { archivedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        },
        setupRuns: {
          where: { status: { in: ["NEEDS_REVIEW", "PARTIAL", "APPROVED"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { suggestedPersonasJson: true },
        },
      },
    }),
    prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      include: {
        icp: { select: { name: true } },
        persona: { select: { name: true } },
        offer: { select: { name: true } },
        contacts: {
          select: {
            status: true,
            contact: {
              select: { companyId: true, company: true },
            },
            emailDrafts: { select: { id: true } },
          },
        },
      },
    }),
  ]);

  const firstProduct = products[0] ?? null;
  const completeProducts = products.filter(
    (product) =>
      product.approvalStatus === "APPROVED" &&
      product.icps.some(hasInterpretedCriteria) &&
      product.personas.length > 0,
  );
  const completeProduct = completeProducts[0] ?? null;
  const activeProduct = completeProduct ?? firstProduct;
  const readyIcps = activeProduct?.icps.filter(hasInterpretedCriteria) ?? [];
  const interpretedIcp = readyIcps[0] ?? null;
  const icpCount = readyIcps.length;
  const productDone = activeProduct?.approvalStatus === "APPROVED";
  const icpDone = icpCount > 0;
  const personasDone = Boolean(activeProduct?.personas.length);
  const productHref = activeProduct
    ? `/setup/${activeProduct.id}`
    : "/setup/new";
  const suggestedRoleCount = normalizeSuggestedBuyerRoles(
    activeProduct?.setupRuns[0]?.suggestedPersonasJson,
  ).length;

  return {
    setupComplete: Boolean(completeProduct),
    completeProductIds: completeProducts.map((product) => product.id),
    product: {
      done: productDone,
      label: productDone ? "Approved" : "Not started",
      detail: activeProduct
        ? productDone
          ? activeProduct.name
          : `${activeProduct.name} needs review and approval`
        : "Research, review, and approve your product",
      actionLabel: activeProduct
        ? productDone
          ? "Review product"
          : "Continue product setup"
        : "Add product",
      href: productHref,
      suggestedRoleCount,
    },
    icp: {
      done: icpDone,
      label: icpDone ? "Saved" : "Not started",
      detail: icpDone
        ? icpCount > 1
          ? `${icpCount} saved`
          : interpretedIcp!.name
        : "Define and interpret a primary target",
      actionLabel: icpDone
        ? icpCount > 1
          ? "Review ICPs"
          : "Review ICP"
        : "Add ICP",
      href: activeProduct
        ? icpDone
          ? icpCount > 1
            ? `/setup/${activeProduct.id}/icps`
            : `/setup/${activeProduct.id}/icps/${interpretedIcp!.id}`
          : `/setup/${activeProduct.id}/icps/new`
        : "/setup/new",
      name: interpretedIcp?.name ?? null,
      count: icpCount,
      criterionCount: interpretedIcp?.criteria.length ?? 0,
      needsLookupCount:
        interpretedIcp?.criteria.filter(
          (criterion) =>
            criterion.evidenceClass === "TARGETED_SEARCH" &&
            criterion.targetedSearchDecision == null,
        ).length ?? 0,
    },
    personas: {
      done: personasDone,
      label: personasDone ? "Saved" : "Not started",
      detail: personasDone
        ? `${activeProduct!.personas.length} saved`
        : "Build at least one buyer persona",
      actionLabel: personasDone ? "Manage personas" : "Build persona",
      href: activeProduct
        ? `/setup/${activeProduct.id}#personas`
        : "/setup/new",
      names: activeProduct?.personas.map((persona) => persona.name) ?? [],
    },
    campaigns: campaigns.map((campaign) => {
      const companyKeys = new Set(
        campaign.contacts
          .map((entry) =>
            entry.contact.companyId
              ? `id:${entry.contact.companyId}`
              : entry.contact.company?.trim().toLowerCase()
                ? `name:${entry.contact.company.trim().toLowerCase()}`
                : null,
          )
          .filter((value): value is string => Boolean(value)),
      );
      const qualified = campaign.contacts.filter(
        (entry) => entry.status !== "EXCLUDED",
      ).length;
      const emailsToWrite = campaign.contacts.filter(
        (entry) =>
          entry.status !== "EXCLUDED" && entry.emailDrafts.length === 0,
      ).length;
      return {
        id: campaign.id,
        name: campaign.name,
        context: [
          campaign.icp.name,
          campaign.persona.name,
          campaign.offerName ?? campaign.offer?.name,
        ]
          .filter(Boolean)
          .join(" · "),
        companies: companyKeys.size,
        qualified,
        contacts: campaign.contacts.length,
        emailsToWrite,
      };
    }),
  };
}

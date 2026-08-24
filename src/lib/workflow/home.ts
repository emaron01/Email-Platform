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
      product.icps.some(
        (icp) => Boolean(icp.lastInterpretedAt) && icp.criteria.length > 0,
      ) &&
      product.personas.length > 0,
  );
  const completeProduct = completeProducts[0] ?? null;
  const activeProduct = completeProduct ?? firstProduct;
  const interpretedIcp =
    activeProduct?.icps.find(
      (icp) => Boolean(icp.lastInterpretedAt) && icp.criteria.length > 0,
    ) ?? null;
  const productDone = activeProduct?.approvalStatus === "APPROVED";
  const icpDone = Boolean(interpretedIcp);
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
      label: icpDone ? "Interpreted" : "Not started",
      detail: interpretedIcp
        ? interpretedIcp.name
        : "Define and interpret a primary target",
      actionLabel: interpretedIcp ? "Review ICP" : "Add ICP",
      href: activeProduct
        ? interpretedIcp
          ? `/setup/${activeProduct.id}/icps/${interpretedIcp.id}`
          : `/setup/${activeProduct.id}/icps/new`
        : "/setup/new",
      name: interpretedIcp?.name ?? null,
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

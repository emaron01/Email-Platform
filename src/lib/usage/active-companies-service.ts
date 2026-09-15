/**
 * Node-safe active researched company counting (no server-only).
 */
import { prisma } from "@/lib/prisma-client";
import { isResearchFresh } from "@/lib/research/freshness";
import { getResearchPolicy } from "@/lib/usage/policy-service";

export type CountActiveResearchedCompaniesOptions = {
  /**
   * TEAM/ENTERPRISE: count fresh companies this user first introduced
   * (firstResearchedByUserId), not rows they merely re-researched.
   */
  firstResearchedByUserId?: string | null;
  /**
   * When true (quota claim path), also count IN_PROGRESS introducer claims
   * so concurrent net-new starts cannot exceed the floor before COMPLETED.
   */
  includeInProgressClaims?: boolean;
};

export async function countActiveResearchedCompanies(
  organizationId: string,
  now: Date = new Date(),
  options?: CountActiveResearchedCompaniesOptions,
): Promise<number> {
  const researchPolicy = await getResearchPolicy(organizationId);
  const freshnessDays = researchPolicy.researchFreshnessDays;

  const statuses: Array<"COMPLETED" | "PARTIAL" | "IN_PROGRESS"> =
    options?.includeInProgressClaims && options.firstResearchedByUserId
      ? ["COMPLETED", "PARTIAL", "IN_PROGRESS"]
      : ["COMPLETED", "PARTIAL"];

  const researches = await prisma.companyResearch.findMany({
    where: {
      organizationId,
      status: { in: statuses },
      ...(options?.firstResearchedByUserId
        ? { firstResearchedByUserId: options.firstResearchedByUserId }
        : {}),
    },
    select: {
      companyId: true,
      status: true,
      expiresAt: true,
      researchConfidence: true,
      researchedAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const latestByCompany = new Map<string, (typeof researches)[number]>();
  for (const row of researches) {
    if (!latestByCompany.has(row.companyId)) {
      latestByCompany.set(row.companyId, row);
    }
  }

  let count = 0;
  for (const research of latestByCompany.values()) {
    if (research.status === "IN_PROGRESS") {
      count += 1;
      continue;
    }
    if (isResearchFresh(research, now, freshnessDays)) {
      count += 1;
    }
  }
  return count;
}

export async function companyHasActiveResearchSlot(
  organizationId: string,
  companyId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const researchPolicy = await getResearchPolicy(organizationId);
  const latest = await prisma.companyResearch.findFirst({
    where: { organizationId, companyId },
    orderBy: { updatedAt: "desc" },
  });
  if (!latest) return false;
  return isResearchFresh(
    latest,
    now,
    researchPolicy.researchFreshnessDays,
  );
}

/** True when the org has never stored any CompanyResearch row for this company. */
export async function orgHasAnyCompanyResearch(
  organizationId: string,
  companyId: string,
): Promise<boolean> {
  const row = await prisma.companyResearch.findFirst({
    where: { organizationId, companyId },
    select: { id: true },
  });
  return Boolean(row);
}

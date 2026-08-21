import "server-only";

import { prisma } from "@/lib/prisma";
import { isResearchFresh } from "@/lib/research/freshness";
import { getResearchPolicy } from "@/lib/usage/policy";

/**
 * Active researched company =
 * a unique Company in the Organization that currently has usable CompanyResearch
 * under the Organization's researchFreshnessDays / freshness rules.
 *
 * Does NOT count: web searches, AI calls, refreshes, contacts, or scoring runs.
 * One company = one slot. Refresh does not create another slot.
 */
export async function countActiveResearchedCompanies(
  organizationId: string,
  now: Date = new Date(),
): Promise<number> {
  const researchPolicy = await getResearchPolicy(organizationId);
  const freshnessDays = researchPolicy.researchFreshnessDays;

  const researches = await prisma.companyResearch.findMany({
    where: {
      organizationId,
      status: { in: ["COMPLETED", "PARTIAL"] },
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

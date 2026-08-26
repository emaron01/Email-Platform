import type { CompanyResearch } from "@prisma/client";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import { resolveCompanyActualWithProvenance } from "@/lib/criteria/research-cascade";

function hasText(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function contactHasCriterionEvidence(
  criterion: CriterionSnapshot,
  contactResearch: {
    currentTitle?: string | null;
    roleSummary?: string | null;
    responsibilities?: unknown;
    ownershipAreas?: unknown;
    professionalSignals?: unknown;
    negativeRoleSignals?: unknown;
  } | null,
  title: string | null,
): boolean {
  const type = criterion.criterionType.toLowerCase();
  const name = criterion.name.toLowerCase();

  if (type.includes("title") || name.includes("title")) {
    return Boolean(
      title?.trim() ||
        contactResearch?.currentTitle?.trim() ||
        contactResearch?.roleSummary?.trim(),
    );
  }

  if (
    type.includes("responsib") ||
    type.includes("ownership") ||
    name.includes("responsib") ||
    name.includes("ownership")
  ) {
    return (
      hasText(contactResearch?.responsibilities) ||
      hasText(contactResearch?.ownershipAreas) ||
      Boolean(contactResearch?.roleSummary?.trim())
    );
  }

  if (type.includes("department") || type.includes("function")) {
    return (
      Boolean(contactResearch?.roleSummary?.trim()) ||
      hasText(contactResearch?.ownershipAreas)
    );
  }

  if (type.includes("seniority")) {
    return Boolean(title?.trim() || contactResearch?.currentTitle?.trim());
  }

  if (
    type.includes("pain") ||
    type.includes("outcome") ||
    type.includes("signal")
  ) {
    return (
      hasText(contactResearch?.professionalSignals) ||
      Boolean(contactResearch?.roleSummary?.trim())
    );
  }

  return Boolean(contactResearch?.roleSummary?.trim());
}

/**
 * Returns criterion names lacking contact-level evidence for targeted research.
 */
export function identifyPersonaEvidenceGaps(
  personaCriteria: CriterionSnapshot[],
  contactResearch: {
    currentTitle?: string | null;
    roleSummary?: string | null;
    responsibilities?: unknown;
    ownershipAreas?: unknown;
    professionalSignals?: unknown;
    negativeRoleSignals?: unknown;
  } | null,
  title: string | null,
): string[] {
  const gaps: string[] = [];
  for (const criterion of personaCriteria) {
    if (!contactHasCriterionEvidence(criterion, contactResearch, title)) {
      gaps.push(criterion.name);
    }
  }
  return gaps;
}

function companyResearchToContext(research: CompanyResearch | null): {
  relevantTechnologies?: string[] | null;
  buyingSignals?: string[] | null;
  riskSignals?: string[] | null;
  primaryMarkets?: string[] | null;
  companySizeContext?: string | null;
  companySummary?: string | null;
  whatTheySell?: string | null;
  businessModel?: string | null;
} | null {
  if (!research) return null;
  return {
    relevantTechnologies: parseStringArray(research.relevantTechnologies),
    buyingSignals: parseStringArray(research.buyingSignals),
    riskSignals: parseStringArray(research.riskSignals),
    primaryMarkets: parseStringArray(research.primaryMarkets),
    companySizeContext: research.companySizeContext,
    companySummary: research.companySummary,
    whatTheySell: research.whatTheySell,
    businessModel: research.businessModel,
  };
}

/**
 * Returns researchGuidance strings for ICP criteria lacking company evidence.
 */
export function identifyIcpEvidenceGaps(
  icpCriteria: CriterionSnapshot[],
  company: {
    industry?: string | null;
    employeeCount?: number | null;
    revenue?: { toString(): string } | number | string | null;
    location?: string | null;
  },
  companyResearch: CompanyResearch | null,
): string[] {
  const researchCtx = companyResearchToContext(companyResearch);
  const gaps: string[] = [];

  for (const criterion of icpCriteria) {
    const resolution = resolveCompanyActualWithProvenance(
      criterion,
      company,
      researchCtx,
    );
    if (resolution.provenance?.hedged) continue;
    if (resolution.value == null || resolution.value === "") {
      const guidance =
        criterion.researchGuidance?.trim() ||
        `Research evidence for: ${criterion.name}`;
      gaps.push(guidance);
    }
  }

  return gaps;
}

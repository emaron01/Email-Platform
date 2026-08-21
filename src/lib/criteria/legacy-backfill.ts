/**
 * Convert legacy ICP / Persona firmographic fields into structured criteria.
 * Additive — does not delete legacy columns.
 */

import type { Icp, Persona, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { InterpretedCriterionDraft } from "@/lib/criteria/types";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((s) => s.trim()).filter(Boolean);
}

export function buildLegacyIcpCriteria(icp: Icp): InterpretedCriterionDraft[] {
  const out: InterpretedCriterionDraft[] = [];
  let sort = 0;

  const industries = asStringArray(icp.targetIndustries);
  if (industries.length) {
    out.push({
      name: "Industry",
      criterionType: "industry",
      dataType: "MULTI_SELECT",
      operator: "IN",
      targetValue: industries,
      importance: "HIGH",
      isRequired: true,
      isDisqualifier: false,
      researchGuidance: "Confirm primary industry / vertical.",
      sortOrder: sort++,
      source: "MIGRATED_FROM_LEGACY",
    });
  }

  if (icp.minEmployees != null || icp.maxEmployees != null) {
    out.push({
      name: "Employee Count",
      criterionType: "employee_count",
      dataType: "NUMBER",
      operator: "BETWEEN",
      minValue: icp.minEmployees,
      maxValue: icp.maxEmployees,
      importance: "HIGH",
      isRequired: false,
      isDisqualifier: false,
      researchGuidance: "Estimate employee headcount.",
      sortOrder: sort++,
      source: "MIGRATED_FROM_LEGACY",
    });
  }

  if (icp.minRevenue != null || icp.maxRevenue != null) {
    out.push({
      name: "Company Revenue",
      criterionType: "company_revenue",
      dataType: "CURRENCY",
      operator: "BETWEEN",
      minValue: icp.minRevenue?.toString() ?? null,
      maxValue: icp.maxRevenue?.toString() ?? null,
      importance: "HIGH",
      isRequired: false,
      isDisqualifier: false,
      researchGuidance: "Estimate annual company revenue.",
      sortOrder: sort++,
      source: "MIGRATED_FROM_LEGACY",
    });
  }

  const geos = asStringArray(icp.targetGeographies);
  if (geos.length) {
    out.push({
      name: "Geography",
      criterionType: "geography",
      dataType: "MULTI_SELECT",
      operator: "IN",
      targetValue: geos,
      importance: "MEDIUM",
      isRequired: false,
      isDisqualifier: false,
      researchGuidance: "Confirm HQ / primary operating geography.",
      sortOrder: sort++,
      source: "MIGRATED_FROM_LEGACY",
    });
  }

  const tech = asStringArray(icp.requiredTechnologies);
  if (tech.length) {
    out.push({
      name: "Required Technologies",
      criterionType: "technology",
      dataType: "MULTI_SELECT",
      operator: "IN",
      targetValue: tech,
      importance: "MEDIUM",
      isRequired: true,
      isDisqualifier: false,
      researchGuidance: "Look for technology stack evidence.",
      sortOrder: sort++,
      source: "MIGRATED_FROM_LEGACY",
    });
  }

  for (const signal of asStringArray(icp.positiveSignals)) {
    out.push({
      name: signal,
      criterionType: "positive_signal",
      dataType: "TEXT",
      operator: "EXISTS",
      importance: "MEDIUM",
      isRequired: false,
      isDisqualifier: false,
      researchGuidance: `Look for buying signal: ${signal}`,
      sortOrder: sort++,
      source: "MIGRATED_FROM_LEGACY",
    });
  }

  for (const signal of asStringArray(icp.negativeSignals)) {
    out.push({
      name: signal,
      criterionType: "negative_signal",
      dataType: "TEXT",
      operator: "EXISTS",
      importance: "CRITICAL",
      isRequired: false,
      isDisqualifier: true,
      researchGuidance: `Disqualify if evidence of: ${signal}`,
      sortOrder: sort++,
      source: "MIGRATED_FROM_LEGACY",
    });
  }

  return out;
}

export function buildLegacyPersonaCriteria(
  persona: Persona,
): InterpretedCriterionDraft[] {
  const out: InterpretedCriterionDraft[] = [];
  let sort = 0;

  const titles = asStringArray(persona.targetTitles);
  if (titles.length) {
    out.push({
      name: "Likely Titles",
      description: "Title patterns are evidence, not definitive proof of role fit.",
      criterionType: "title_pattern",
      dataType: "MULTI_SELECT",
      operator: "IN",
      targetValue: titles,
      importance: "MEDIUM",
      isRequired: false,
      isDisqualifier: false,
      researchGuidance: "Treat titles as weak evidence; verify responsibilities.",
      sortOrder: sort++,
      source: "MIGRATED_FROM_LEGACY",
    });
  }

  if (persona.seniority?.trim()) {
    out.push({
      name: "Seniority",
      criterionType: "seniority",
      dataType: "TEXT",
      operator: "CONTAINS",
      targetValue: persona.seniority.trim(),
      importance: "HIGH",
      isRequired: false,
      isDisqualifier: false,
      sortOrder: sort++,
      source: "MIGRATED_FROM_LEGACY",
    });
  }

  if (persona.department?.trim()) {
    out.push({
      name: "Department / Function",
      criterionType: "department",
      dataType: "TEXT",
      operator: "CONTAINS",
      targetValue: persona.department.trim(),
      importance: "HIGH",
      isRequired: false,
      isDisqualifier: false,
      sortOrder: sort++,
      source: "MIGRATED_FROM_LEGACY",
    });
  }

  if (persona.responsibilities?.trim()) {
    out.push({
      name: "Role Responsibilities",
      criterionType: "responsibility",
      dataType: "TEXT",
      operator: "CONTAINS",
      targetValue: persona.responsibilities.trim(),
      importance: "CRITICAL",
      isRequired: true,
      isDisqualifier: false,
      researchGuidance: "Confirm ownership / responsibilities from role evidence.",
      sortOrder: sort++,
      source: "MIGRATED_FROM_LEGACY",
    });
  }

  if (persona.painPoints?.trim()) {
    out.push({
      name: "Pain Relevance",
      criterionType: "pain",
      dataType: "TEXT",
      operator: "CONTAINS",
      targetValue: persona.painPoints.trim(),
      importance: "MEDIUM",
      isRequired: false,
      isDisqualifier: false,
      sortOrder: sort++,
      source: "MIGRATED_FROM_LEGACY",
    });
  }

  if (persona.desiredOutcomes?.trim()) {
    out.push({
      name: "Desired Outcomes",
      criterionType: "desired_outcome",
      dataType: "TEXT",
      operator: "CONTAINS",
      targetValue: persona.desiredOutcomes.trim(),
      importance: "MEDIUM",
      isRequired: false,
      isDisqualifier: false,
      sortOrder: sort++,
      source: "MIGRATED_FROM_LEGACY",
    });
  }

  return out;
}

/** Idempotent: if ICP has zero criteria, seed from legacy fields. */
export async function ensureIcpLegacyCriteriaBackfilled(
  organizationId: string,
  icpId: string,
): Promise<number> {
  const existing = await prisma.icpCriterion.count({
    where: { organizationId, icpId },
  });
  if (existing > 0) return 0;

  const icp = await prisma.icp.findFirst({
    where: { id: icpId, organizationId },
  });
  if (!icp) return 0;

  const drafts = buildLegacyIcpCriteria(icp);
  if (drafts.length === 0) return 0;

  await prisma.icpCriterion.createMany({
    data: drafts.map((d) => ({
      organizationId,
      icpId,
      name: d.name,
      description: d.description ?? null,
      criterionType: d.criterionType,
      dataType: d.dataType,
      operator: d.operator,
      targetValue: d.targetValue as Prisma.InputJsonValue,
      minValue: d.minValue as Prisma.InputJsonValue,
      maxValue: d.maxValue as Prisma.InputJsonValue,
      allowedValues: d.allowedValues as Prisma.InputJsonValue,
      importance: d.importance,
      isRequired: d.isRequired,
      isDisqualifier: d.isDisqualifier,
      researchGuidance: d.researchGuidance ?? null,
      source: "MIGRATED_FROM_LEGACY",
      sortOrder: d.sortOrder,
      manuallyEdited: false,
    })),
  });
  return drafts.length;
}

export async function ensurePersonaLegacyCriteriaBackfilled(
  organizationId: string,
  personaId: string,
): Promise<number> {
  const existing = await prisma.personaCriterion.count({
    where: { organizationId, personaId },
  });
  if (existing > 0) return 0;

  const persona = await prisma.persona.findFirst({
    where: { id: personaId, organizationId },
  });
  if (!persona) return 0;

  const drafts = buildLegacyPersonaCriteria(persona);
  if (drafts.length === 0) return 0;

  await prisma.personaCriterion.createMany({
    data: drafts.map((d) => ({
      organizationId,
      personaId,
      name: d.name,
      description: d.description ?? null,
      criterionType: d.criterionType,
      dataType: d.dataType,
      operator: d.operator,
      targetValue: d.targetValue as Prisma.InputJsonValue,
      minValue: d.minValue as Prisma.InputJsonValue,
      maxValue: d.maxValue as Prisma.InputJsonValue,
      allowedValues: d.allowedValues as Prisma.InputJsonValue,
      importance: d.importance,
      isRequired: d.isRequired,
      isDisqualifier: d.isDisqualifier,
      researchGuidance: d.researchGuidance ?? null,
      source: "MIGRATED_FROM_LEGACY",
      sortOrder: d.sortOrder,
      manuallyEdited: false,
    })),
  });
  return drafts.length;
}

import type { Icp, IcpCriterion, Persona, PersonaCriterion, Product } from "@prisma/client";
import type {
  CriterionSnapshot,
  CriterionDataTypeValue,
  CriterionImportanceValue,
  CriterionOperatorValue,
} from "@/lib/criteria/types";
import type {
  IcpSnapshot,
  PersonaSnapshot,
  ProductSnapshot,
} from "@/lib/scoring/types";

function decimalToString(
  value: { toString(): string } | null | undefined,
): string | null {
  if (value == null) return null;
  return value.toString();
}

function asStringArray(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  return value.map(String);
}

export function snapshotCriterionRow(
  row: IcpCriterion | PersonaCriterion,
): CriterionSnapshot {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    criterionType: row.criterionType,
    dataType: row.dataType as CriterionDataTypeValue,
    operator: row.operator as CriterionOperatorValue,
    targetValue: row.targetValue,
    minValue: row.minValue,
    maxValue: row.maxValue,
    allowedValues: row.allowedValues,
    importance: row.importance as CriterionImportanceValue,
    isRequired: row.isRequired,
    isDisqualifier: row.isDisqualifier,
    researchGuidance: row.researchGuidance,
    source: row.source,
    confidence: row.confidence,
    manuallyEdited: row.manuallyEdited,
    sortOrder: row.sortOrder,
  };
}

export function snapshotProduct(product: Product): ProductSnapshot {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    valueProposition: product.valueProposition,
    averageOrderValue: decimalToString(product.averageOrderValue),
    websiteUrl: product.websiteUrl,
  };
}

export function snapshotIcp(
  icp: Icp,
  criteria: CriterionSnapshot[] = [],
): IcpSnapshot {
  return {
    id: icp.id,
    name: icp.name,
    description: icp.description,
    definition: icp.definition,
    additionalContext: icp.additionalContext,
    interpretationVersion: icp.interpretationVersion,
    targetIndustries: asStringArray(icp.targetIndustries),
    minEmployees: icp.minEmployees,
    maxEmployees: icp.maxEmployees,
    minRevenue: decimalToString(icp.minRevenue),
    maxRevenue: decimalToString(icp.maxRevenue),
    targetGeographies: asStringArray(icp.targetGeographies),
    requiredTechnologies: asStringArray(icp.requiredTechnologies),
    positiveSignals: asStringArray(icp.positiveSignals),
    negativeSignals: asStringArray(icp.negativeSignals),
    notes: icp.notes,
    criteria,
  };
}

export function snapshotPersona(
  persona: Persona,
  criteria: CriterionSnapshot[] = [],
): PersonaSnapshot {
  return {
    id: persona.id,
    name: persona.name,
    definition: persona.definition,
    additionalContext: persona.additionalContext,
    interpretationVersion: persona.interpretationVersion,
    targetTitles: asStringArray(persona.targetTitles),
    department: persona.department,
    seniority: persona.seniority,
    responsibilities: persona.responsibilities,
    painPoints: persona.painPoints,
    desiredOutcomes: persona.desiredOutcomes,
    messagingNotes: persona.messagingNotes,
    criteria,
  };
}

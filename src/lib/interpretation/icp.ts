import "server-only";

import type { IcpCriterion, Prisma } from "@prisma/client";
import { Prisma as PrismaRuntime } from "@prisma/client";
import {
  getInterpretationAiConfig,
  getInterpretationAiProvider,
  getAiConfigPublicSummary,
  isInterpretationAiConfigured,
} from "@/lib/ai";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import {
  buildLegacyIcpCriteria,
  ensureIcpLegacyCriteriaBackfilled,
} from "@/lib/criteria/legacy-backfill";
import {
  checkTargetedSearchCap,
  inferEvidenceClassFromCriterion,
  normalizeEvidenceClass,
} from "@/lib/criteria/evidence-class";
import { normalizeInOperatorValues } from "@/lib/criteria/multi-value";
import { planCriterionReinterpretation } from "@/lib/criteria/merge";
import {
  ICP_INTERPRETATION_PROMPT_VERSION,
  type CriterionSnapshot,
  type InterpretedCriterionDraft,
} from "@/lib/criteria/types";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import { getResearchPolicy } from "@/lib/usage/policy";
import {
  icpInterpretationResultSchema,
  parseIcpInterpretedCriteria,
} from "@/lib/interpretation/schema";
import type { AiMessage } from "@/lib/ai/types";

function criterionRowToSnapshot(row: IcpCriterion): CriterionSnapshot {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    criterionType: row.criterionType,
    dataType: row.dataType,
    operator: row.operator,
    targetValue: row.targetValue,
    minValue: row.minValue,
    maxValue: row.maxValue,
    allowedValues: row.allowedValues,
    importance: row.importance,
    isRequired: row.isRequired,
    isDisqualifier: row.isDisqualifier,
    researchGuidance: row.researchGuidance,
    source: row.source,
    confidence: row.confidence,
    manuallyEdited: row.manuallyEdited,
    evidenceClass: row.evidenceClass,
    evidenceClassLocked: row.evidenceClassLocked,
    targetedSearchDecision: row.targetedSearchDecision,
    targetedSearchDecisionFingerprint: row.targetedSearchDecisionFingerprint,
    targetedSearchDecidedAt: row.targetedSearchDecidedAt?.toISOString() ?? null,
    sortOrder: row.sortOrder,
  };
}

function buildIcpInterpretationMessages(input: {
  productName: string;
  productDescription: string | null;
  definition: string;
  additionalContext: string | null;
  existingCriteria: CriterionSnapshot[];
}): AiMessage[] {
  const system = `You are a production ICP interpretation engine.
Prompt version: ${ICP_INTERPRETATION_PROMPT_VERSION}

Convert natural-language ICP definitions into structured, auditable criteria for company research and scoring.

RULES:
1. Preserve the user's intent — do not invent requirements not implied by the definition.
2. Each criterion must be evaluable from company research evidence when possible.
3. Include researchGuidance describing what evidence to look for.
4. Use appropriate dataType, operator, and target values.
5. Mark disqualifiers with isDisqualifier=true when the definition implies hard exclusions.
6. For operator IN / NOT_IN: targetValue MUST be a JSON array of discrete values.
   Never put "or" / "and" inside a single string. Example: ["Salesforce", "HubSpot"] not
   ["Salesforce or HubSpot"].
7. Assign evidenceClass using these definitions:
   - LIST_DATA: satisfiable from uploaded list fields (industry, employee count, revenue, geography, domain).
   - COMPANY_RESEARCH: derivable from standard company research (description, markets, public signals, general firmographics).
   - TARGETED_SEARCH: requires a specific per-company lookup that MAY NOT BE FINDABLE (tech stack / CRM / competitor products in use, certifications, facility counts, headcount by function). Prefer this when unsure.
   - SEMANTIC: requires AI judgment over evidence (fit narratives, positioning, complex buying motion).
   Worked examples:
   - "Industry is X" → LIST_DATA
   - "Between 50 and 500 employees" → LIST_DATA
   - "Uses Salesforce or HubSpot" → TARGETED_SEARCH
   - "Owns 25+ buildings" → TARGETED_SEARCH
   - "Currently uses [competitor product]" → TARGETED_SEARCH
   - "Sells complex multi-stakeholder deals" → SEMANTIC
8. Also return a short plain-language read-back:
   - understoodSummary: 2–4 sentences describing what you understood from the user's definition.
     Do not invent requirements. Do not rewrite their narrative as if it were your text.
   - undetermined: a list of specific facts or constraints named in the definition that you
     could not turn into a reliable criterion from the available wording (empty array if none).
9. NEVER return a rewritten definition. The user's narrative is authoritative and is stored
   separately — you only produce criteria plus this read-back.
10. Return JSON matching the schema only.`;

  const user = JSON.stringify({
    product: {
      name: input.productName,
      description: input.productDescription,
    },
    icpDefinition: input.definition,
    additionalContext: input.additionalContext,
    existingFirmographics: input.existingCriteria.map((c) => ({
      name: c.name,
      type: c.criterionType,
      operator: c.operator,
      evidenceClass: c.evidenceClass ?? null,
      manuallyEdited: c.manuallyEdited ?? false,
      evidenceClassLocked: c.evidenceClassLocked ?? false,
    })),
    responseSchema: {
      understoodSummary:
        "2-4 sentence plain-language read-back of what was understood",
      undetermined: ["specific named items that could not be determined"],
      criteria: [
        {
          name: "string",
          description: "string|null",
          criterionType: "string slug e.g. industry, employee_count",
          dataType: "TEXT|NUMBER|CURRENCY|BOOLEAN|ENUM|MULTI_SELECT|DATE",
          operator: "EQUALS|NOT_EQUALS|CONTAINS|IN|NOT_IN|GREATER_THAN|...",
          targetValue:
            "for IN/NOT_IN: array of discrete strings; otherwise any|null",
          minValue: "any|null",
          maxValue: "any|null",
          importance: "CRITICAL|HIGH|MEDIUM|LOW",
          isRequired: "boolean",
          isDisqualifier: "boolean",
          evidenceClass: "LIST_DATA|COMPANY_RESEARCH|TARGETED_SEARCH|SEMANTIC",
          researchGuidance: "string|null",
          sortOrder: "number",
        },
      ],
    },
  });

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export async function listIcpCriteria(
  organizationId: string,
  icpId: string,
): Promise<CriterionSnapshot[]> {
  const rows = await prisma.icpCriterion.findMany({
    where: { organizationId, icpId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(criterionRowToSnapshot);
}

export async function updateIcpCriterionManual(input: {
  organizationId: string;
  icpId: string;
  criterionId: string;
  data: Partial<
    Pick<
      IcpCriterion,
      | "name"
      | "description"
      | "criterionType"
      | "dataType"
      | "operator"
      | "targetValue"
      | "minValue"
      | "maxValue"
      | "allowedValues"
      | "importance"
      | "isRequired"
      | "isDisqualifier"
      | "researchGuidance"
      | "sortOrder"
      | "evidenceClass"
      | "evidenceClassLocked"
      | "targetedSearchDecision"
      | "targetedSearchDecisionFingerprint"
      | "targetedSearchDecidedAt"
    >
  >;
}): Promise<CriterionSnapshot> {
  const existing = await prisma.icpCriterion.findFirst({
    where: {
      id: input.criterionId,
      organizationId: input.organizationId,
      icpId: input.icpId,
    },
  });
  if (!existing) {
    throw new TenantError(
      "ICP criterion not found in the active organization.",
    );
  }

  const nextEvidenceClass =
    input.data.evidenceClass !== undefined
      ? normalizeEvidenceClass(input.data.evidenceClass)
      : existing.evidenceClass;

  // Cap check when class becomes / remains TARGETED_SEARCH.
  if (nextEvidenceClass === "TARGETED_SEARCH") {
    const siblings = await prisma.icpCriterion.findMany({
      where: { organizationId: input.organizationId, icpId: input.icpId },
      select: { id: true, name: true, evidenceClass: true },
    });
    const projected = siblings.map((s) => ({
      name: s.id === existing.id ? (input.data.name ?? s.name) : s.name,
      evidenceClass: s.id === existing.id ? nextEvidenceClass : s.evidenceClass,
    }));
    const policy = await getResearchPolicy(input.organizationId);
    const cap = checkTargetedSearchCap({
      criteria: projected,
      maxAllowed: policy.maxTargetedSearchCriteriaPerIcp,
    });
    if (!cap.ok) throw new TenantError(cap.message);
  }

  const updated = await prisma.icpCriterion.update({
    where: { id: existing.id },
    data: {
      name: input.data.name,
      description: input.data.description,
      criterionType: input.data.criterionType,
      dataType: input.data.dataType,
      operator: input.data.operator,
      targetValue:
        input.data.targetValue === undefined
          ? undefined
          : input.data.targetValue === null
            ? PrismaRuntime.JsonNull
            : (input.data.targetValue as Prisma.InputJsonValue),
      minValue:
        input.data.minValue === undefined
          ? undefined
          : input.data.minValue === null
            ? PrismaRuntime.JsonNull
            : (input.data.minValue as Prisma.InputJsonValue),
      maxValue:
        input.data.maxValue === undefined
          ? undefined
          : input.data.maxValue === null
            ? PrismaRuntime.JsonNull
            : (input.data.maxValue as Prisma.InputJsonValue),
      allowedValues:
        input.data.allowedValues === undefined
          ? undefined
          : input.data.allowedValues === null
            ? PrismaRuntime.JsonNull
            : (input.data.allowedValues as Prisma.InputJsonValue),
      importance: input.data.importance,
      isRequired: input.data.isRequired,
      isDisqualifier: input.data.isDisqualifier,
      researchGuidance: input.data.researchGuidance,
      sortOrder: input.data.sortOrder,
      evidenceClass: input.data.evidenceClass
        ? normalizeEvidenceClass(input.data.evidenceClass)
        : undefined,
      evidenceClassLocked:
        input.data.evidenceClassLocked ??
        (input.data.evidenceClass !== undefined ? true : undefined),
      targetedSearchDecision: input.data.targetedSearchDecision,
      targetedSearchDecisionFingerprint:
        input.data.targetedSearchDecisionFingerprint,
      targetedSearchDecidedAt: input.data.targetedSearchDecidedAt,
      manuallyEdited: true,
      source: "MANUAL",
    },
  });
  return criterionRowToSnapshot(updated);
}

async function persistLegacyCriteria(
  organizationId: string,
  icpId: string,
): Promise<{ criteria: CriterionSnapshot[]; version: number }> {
  await ensureIcpLegacyCriteriaBackfilled(organizationId, icpId);
  const icp = await prisma.icp.findFirst({
    where: { id: icpId, organizationId },
  });
  if (!icp) {
    throw new TenantError("ICP not found in the active organization.");
  }

  const count = await prisma.icpCriterion.count({
    where: { organizationId, icpId },
  });
  if (count === 0) {
    const drafts = buildLegacyIcpCriteria(icp);
    if (drafts.length > 0) {
      await prisma.icpCriterion.createMany({
        data: drafts.map((d) => draftToCreateData(organizationId, icpId, d)),
      });
    }
  }

  const criteria = await listIcpCriteria(organizationId, icpId);
  return { criteria, version: icp.interpretationVersion };
}

function draftToCreateData(
  organizationId: string,
  icpId: string,
  d: InterpretedCriterionDraft,
): Prisma.IcpCriterionCreateManyInput {
  const normalized = normalizeInOperatorValues({
    operator: d.operator,
    dataType: d.dataType,
    targetValue: d.targetValue,
    allowedValues: d.allowedValues,
  });
  const evidenceClass = normalizeEvidenceClass(
    d.evidenceClass ??
      inferEvidenceClassFromCriterion({
        name: d.name,
        criterionType: d.criterionType,
        description: d.description,
      }),
  );
  return {
    organizationId,
    icpId,
    name: d.name,
    description: d.description ?? null,
    criterionType: d.criterionType,
    dataType: d.dataType,
    operator: d.operator,
    targetValue: normalized.targetValue as Prisma.InputJsonValue,
    minValue: d.minValue as Prisma.InputJsonValue,
    maxValue: d.maxValue as Prisma.InputJsonValue,
    allowedValues: normalized.allowedValues as Prisma.InputJsonValue,
    importance: d.importance,
    isRequired: d.isRequired,
    isDisqualifier: d.isDisqualifier,
    researchGuidance: d.researchGuidance ?? null,
    evidenceClass,
    evidenceClassLocked: d.evidenceClassLocked ?? false,
    source:
      (d.source as "AI_INTERPRETED" | "MANUAL" | "MIGRATED_FROM_LEGACY") ??
      "AI_INTERPRETED",
    sortOrder: d.sortOrder,
    manuallyEdited: false,
  };
}

function applyLockedEvidenceClass(
  draft: InterpretedCriterionDraft,
  existing: CriterionSnapshot[],
): InterpretedCriterionDraft {
  const locked = existing.find(
    (e) =>
      e.evidenceClassLocked &&
      e.criterionType.trim().toLowerCase() ===
        draft.criterionType.trim().toLowerCase() &&
      e.name.trim().toLowerCase() === draft.name.trim().toLowerCase(),
  );
  if (!locked?.evidenceClass) return draft;
  return {
    ...draft,
    evidenceClass: locked.evidenceClass,
    evidenceClassLocked: true,
  };
}

export async function interpretIcpDefinition(input: {
  organizationId: string;
  icpId: string;
  userId?: string | null;
}): Promise<{ criteria: CriterionSnapshot[]; version: number }> {
  const icp = await prisma.icp.findFirst({
    where: { id: input.icpId, organizationId: input.organizationId },
    include: { product: true, criteria: { orderBy: { sortOrder: "asc" } } },
  });
  if (!icp) {
    throw new TenantError("ICP not found in the active organization.");
  }

  const definition = icp.definition?.trim() || icp.description?.trim();
  if (!definition) {
    throw new TenantError(
      "ICP requires a definition or description before interpretation.",
    );
  }

  if (!isInterpretationAiConfigured()) {
    return persistLegacyCriteria(input.organizationId, input.icpId);
  }

  const existingSnapshots = icp.criteria.map(criterionRowToSnapshot);
  const started = Date.now();
  let providerSummary: ReturnType<typeof getAiConfigPublicSummary> | null =
    null;

  try {
    const ai = getInterpretationAiProvider();
    providerSummary = getAiConfigPublicSummary(getInterpretationAiConfig());

    const response = await ai.generateStructured({
      ...structuredOutputRequest("icpInterpretation"),
      messages: buildIcpInterpretationMessages({
        productName: icp.product.name,
        productDescription: icp.product.description,
        definition,
        additionalContext: icp.additionalContext,
        existingCriteria: existingSnapshots,
      }),
    });

    const parsed = parseIcpInterpretedCriteria(response.data);
    const aiDrafts: InterpretedCriterionDraft[] = parsed.criteria.map((c) => {
      const normalized = normalizeInOperatorValues({
        operator: c.operator,
        dataType: c.dataType,
        targetValue: c.targetValue,
        allowedValues: c.allowedValues,
      });
      const evidenceClass = normalizeEvidenceClass(
        c.evidenceClass ??
          inferEvidenceClassFromCriterion({
            name: c.name,
            criterionType: c.criterionType,
            description: c.description,
          }),
      );
      const draft: InterpretedCriterionDraft = {
        ...c,
        targetValue: normalized.targetValue,
        allowedValues: normalized.allowedValues,
        evidenceClass,
        source: "AI_INTERPRETED",
      };
      return applyLockedEvidenceClass(draft, existingSnapshots);
    });

    const plan = planCriterionReinterpretation({
      existing: icp.criteria.map((c) => ({
        id: c.id,
        name: c.name,
        criterionType: c.criterionType,
        manuallyEdited: c.manuallyEdited,
      })),
      aiDrafts,
    });

    // Cap: projected set = kept manuals + new inserts (never silently drop).
    const keptManual = existingSnapshots.filter((e) => e.manuallyEdited);
    const projectedForCap = [
      ...keptManual.map((m) => ({
        name: m.name,
        evidenceClass: normalizeEvidenceClass(m.evidenceClass),
      })),
      ...plan.insertDrafts.map((d) => ({
        name: d.name,
        evidenceClass: normalizeEvidenceClass(d.evidenceClass),
      })),
    ];
    const policy = await getResearchPolicy(input.organizationId);
    const cap = checkTargetedSearchCap({
      criteria: projectedForCap,
      maxAllowed: policy.maxTargetedSearchCriteriaPerIcp,
    });
    if (!cap.ok) {
      throw new TenantError(cap.message);
    }

    const newVersion = icp.interpretationVersion + 1;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      if (plan.replaceNonManual) {
        await tx.icpCriterion.deleteMany({
          where: {
            organizationId: input.organizationId,
            icpId: input.icpId,
            manuallyEdited: false,
          },
        });
      }

      if (plan.insertDrafts.length > 0) {
        await tx.icpCriterion.createMany({
          data: plan.insertDrafts.map((d) =>
            draftToCreateData(input.organizationId, input.icpId, d),
          ),
        });
      }

      await tx.icp.update({
        where: { id: input.icpId },
        data: {
          interpretationVersion: newVersion,
          interpretationPromptVersion: ICP_INTERPRETATION_PROMPT_VERSION,
          lastInterpretedAt: now,
          interpretationSummary: parsed.understoodSummary.trim(),
          interpretationUndetermined:
            parsed.undetermined
              .map((item) => item.trim())
              .filter(Boolean)
              .join("\n") || null,
        },
      });
    });

    const criteria = await listIcpCriteria(input.organizationId, input.icpId);

    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "INTERPRETATION",
      operation: "ICP_INTERPRETATION",
      provider: providerSummary?.provider ?? null,
      model: providerSummary?.model ?? null,
      status: "SUCCESS",
      durationMs: Date.now() - started,
      metadata: {
        icpId: input.icpId,
        criteriaCount: criteria.length,
        promptVersion: ICP_INTERPRETATION_PROMPT_VERSION,
        version: newVersion,
      },
    });

    return { criteria, version: newVersion };
  } catch (error) {
    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "INTERPRETATION",
      operation: "ICP_INTERPRETATION",
      provider: providerSummary?.provider ?? null,
      model: providerSummary?.model ?? null,
      status: "FAILED",
      durationMs: Date.now() - started,
      metadata: {
        icpId: input.icpId,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

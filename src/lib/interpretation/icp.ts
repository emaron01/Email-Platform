import "server-only";

import type { IcpCriterion, Prisma } from "@prisma/client";
import { Prisma as PrismaRuntime } from "@prisma/client";
import {
  getInterpretationAiConfig,
  getInterpretationAiProvider,
  getAiConfigPublicSummary,
  isInterpretationAiConfigured,
} from "@/lib/ai";
import {
  buildLegacyIcpCriteria,
  ensureIcpLegacyCriteriaBackfilled,
} from "@/lib/criteria/legacy-backfill";
import { planCriterionReinterpretation } from "@/lib/criteria/merge";
import {
  ICP_INTERPRETATION_PROMPT_VERSION,
  type CriterionSnapshot,
  type InterpretedCriterionDraft,
} from "@/lib/criteria/types";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import {
  interpretationResultSchema,
  parseInterpretedCriteria,
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
2. Each criterion must be evaluable from company research evidence.
3. Include researchGuidance describing what evidence to look for.
4. Use appropriate dataType, operator, and target values.
5. Mark disqualifiers with isDisqualifier=true when the definition implies hard exclusions.
6. Return JSON matching the schema only.`;

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
      manuallyEdited: c.manuallyEdited ?? false,
    })),
    responseSchema: {
      criteria: [
        {
          name: "string",
          description: "string|null",
          criterionType: "string slug e.g. industry, employee_count",
          dataType: "TEXT|NUMBER|CURRENCY|BOOLEAN|ENUM|MULTI_SELECT|DATE",
          operator: "EQUALS|NOT_EQUALS|CONTAINS|IN|NOT_IN|GREATER_THAN|...",
          targetValue: "any|null",
          minValue: "any|null",
          maxValue: "any|null",
          importance: "CRITICAL|HIGH|MEDIUM|LOW",
          isRequired: "boolean",
          isDisqualifier: "boolean",
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
    throw new TenantError("ICP criterion not found in the active organization.");
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
  return {
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
    source: (d.source as "AI_INTERPRETED" | "MANUAL" | "MIGRATED_FROM_LEGACY") ??
      "AI_INTERPRETED",
    sortOrder: d.sortOrder,
    manuallyEdited: false,
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
      messages: buildIcpInterpretationMessages({
        productName: icp.product.name,
        productDescription: icp.product.description,
        definition,
        additionalContext: icp.additionalContext,
        existingCriteria: existingSnapshots,
      }),
      schema: interpretationResultSchema,
      schemaName: "icp_interpretation",
    });

    const parsed = parseInterpretedCriteria(response.data);
    const aiDrafts: InterpretedCriterionDraft[] = parsed.criteria.map((c) => ({
      ...c,
      source: "AI_INTERPRETED",
    }));

    const plan = planCriterionReinterpretation({
      existing: icp.criteria.map((c) => ({
        id: c.id,
        name: c.name,
        criterionType: c.criterionType,
        manuallyEdited: c.manuallyEdited,
      })),
      aiDrafts,
    });

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

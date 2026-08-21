import "server-only";

import { Prisma } from "@prisma/client";
import {
  getAiConfigPublicSummary,
  getProductAiConfig,
  getProductAiProvider,
  isProductAiConfigured,
} from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import {
  PRODUCT_SYNTHESIS_PROMPT_VERSION,
  productSynthesisResultSchema,
  type ProductSynthesisResult,
} from "@/lib/product-research/contract";
import { buildProductSynthesisMessages } from "@/lib/product-research/prompt";
import type { EvidenceExcerpt } from "@/lib/product-research/prompt";

export async function synthesizeProductSetup(input: {
  organizationId: string;
  productId: string;
  userId: string | null;
  evidenceBundleId: string;
  correlationId: string;
  excerpts: EvidenceExcerpt[];
  productName: string;
  primaryUrl: string | null;
}): Promise<{
  setupRunId: string;
  result: ProductSynthesisResult | null;
  status: "NEEDS_REVIEW" | "FAILED";
  errorSafe?: string;
}> {
  if (!isProductAiConfigured()) {
    throw new TenantError(
      "Product research AI is not configured. You can still save the Product manually.",
    );
  }

  if (input.excerpts.length === 0) {
    throw new TenantError(
      "No usable evidence to synthesize. Add a URL, notes, paste, or document.",
    );
  }

  const run = await prisma.productSetupRun.create({
    data: {
      organizationId: input.organizationId,
      productId: input.productId,
      evidenceBundleId: input.evidenceBundleId,
      correlationId: input.correlationId,
      status: "SYNTHESIZING",
      synthesisPromptVersion: PRODUCT_SYNTHESIS_PROMPT_VERSION,
      createdByUserId: input.userId,
    },
  });

  await prisma.product.update({
    where: { id: input.productId },
    data: { setupStatus: "SYNTHESIZING" },
  });

  const started = Date.now();
  let providerSummary: ReturnType<typeof getAiConfigPublicSummary> | null =
    null;

  try {
    const ai = getProductAiProvider();
    const config = getProductAiConfig();
    providerSummary = getAiConfigPublicSummary(config);

    const response = await ai.generateStructured({
      messages: buildProductSynthesisMessages({
        productName: input.productName,
        primaryUrl: input.primaryUrl,
        excerpts: input.excerpts,
      }),
      schema: productSynthesisResultSchema,
      schemaName: "product_setup_synthesis",
    });

    const result = productSynthesisResultSchema.parse(response.data);
    const allowedSourceIds = new Set(input.excerpts.map((e) => e.sourceId));
    // Strip evidence refs that cite sources not in the bundle (no invented URLs).
    result.productDraft.evidenceRefs = (result.productDraft.evidenceRefs ?? []).map(
      (ref) => ({
        ...ref,
        sourceIds: (ref.sourceIds ?? []).filter((id) => allowedSourceIds.has(id)),
      }),
    );

    await prisma.productSetupRun.update({
      where: { id: run.id },
      data: {
        status: "NEEDS_REVIEW",
        productDraftJson: result.productDraft as unknown as Prisma.InputJsonValue,
        messagingDraftJson:
          result.productMessagingDraft as unknown as Prisma.InputJsonValue,
        suggestedPersonasJson:
          result.suggestedPersonas as unknown as Prisma.InputJsonValue,
        personaDraftsJson:
          result.personaDrafts as unknown as Prisma.InputJsonValue,
        aiProvider: providerSummary.provider,
        aiModel: providerSummary.model,
        completedAt: new Date(),
      },
    });

    await prisma.productEvidenceBundle.update({
      where: { id: input.evidenceBundleId },
      data: { status: "NEEDS_REVIEW" },
    });

    await prisma.product.update({
      where: { id: input.productId },
      data: {
        setupStatus: "NEEDS_REVIEW",
        approvalStatus: "NEEDS_REVIEW",
      },
    });

    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "PRODUCT_RESEARCH",
      operation: "PRODUCT_SYNTHESIS",
      provider: providerSummary.provider,
      model: providerSummary.model,
      status: "SUCCESS",
      durationMs: Date.now() - started,
      inputTokens: response.usage?.inputTokens ?? null,
      outputTokens: response.usage?.outputTokens ?? null,
      operationId: input.correlationId,
      metadata: {
        correlationId: input.correlationId,
        productId: input.productId,
        evidenceBundleId: input.evidenceBundleId,
        setupRunId: run.id,
        promptVersion: PRODUCT_SYNTHESIS_PROMPT_VERSION,
        suggestedPersonaCount: result.suggestedPersonas.length,
      },
    });

    return { setupRunId: run.id, result, status: "NEEDS_REVIEW" };
  } catch (error) {
    const errorSafe =
      error instanceof TenantError
        ? error.message
        : "Product synthesis could not be completed. Acquired evidence was preserved.";

    await prisma.productSetupRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorSafe,
        completedAt: new Date(),
        aiProvider: providerSummary?.provider,
        aiModel: providerSummary?.model,
      },
    });

    await prisma.product.update({
      where: { id: input.productId },
      data: { setupStatus: "FAILED" },
    });

    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "PRODUCT_RESEARCH",
      operation: "PRODUCT_SYNTHESIS",
      provider: providerSummary?.provider ?? null,
      model: providerSummary?.model ?? null,
      status: "FAILED",
      durationMs: Date.now() - started,
      metadata: {
        correlationId: input.correlationId,
        productId: input.productId,
        evidenceBundleId: input.evidenceBundleId,
        setupRunId: run.id,
      },
    });

    return {
      setupRunId: run.id,
      result: null,
      status: "FAILED",
      errorSafe,
    };
  }
}

/** Retry synthesis using an existing evidence bundle (no URL reacquisition). */
export async function resynthesizeFromBundle(input: {
  organizationId: string;
  productId: string;
  userId: string | null;
  evidenceBundleId: string;
}): Promise<ReturnType<typeof synthesizeProductSetup>> {
  const bundle = await prisma.productEvidenceBundle.findFirst({
    where: {
      id: input.evidenceBundleId,
      organizationId: input.organizationId,
      productId: input.productId,
    },
  });
  if (!bundle) {
    throw new TenantError("Evidence bundle not found in the active organization.");
  }
  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
  });
  if (!product) {
    throw new TenantError("Product not found in the active organization.");
  }

  const raw = bundle.normalizedEvidenceJson;
  let excerpts: EvidenceExcerpt[] = [];
  if (Array.isArray(raw)) {
    excerpts = raw as EvidenceExcerpt[];
  } else if (raw && typeof raw === "object" && Array.isArray((raw as { excerpts?: unknown }).excerpts)) {
    excerpts = (raw as { excerpts: EvidenceExcerpt[] }).excerpts;
  }
  return synthesizeProductSetup({
    organizationId: input.organizationId,
    productId: input.productId,
    userId: input.userId,
    evidenceBundleId: bundle.id,
    correlationId: bundle.correlationId,
    excerpts,
    productName: product.name,
    primaryUrl: product.websiteUrl,
  });
}

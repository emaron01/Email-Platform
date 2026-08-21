import "server-only";

import {
  acquireProductEvidence,
  type IngestSourceInput,
} from "@/lib/product-research/acquire";
import { synthesizeProductSetup } from "@/lib/product-research/synthesize";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";

/**
 * End-to-end: acquire/reuse evidence once → single synthesis → drafts for review.
 * Creating multiple personas from this run does NOT re-run URL research.
 */
export async function researchAndBuildProduct(input: {
  organizationId: string;
  productId: string;
  userId: string | null;
  sources: IngestSourceInput[];
  forceUrlRefresh?: boolean;
}): Promise<{
  evidenceBundleId: string;
  setupRunId: string;
  correlationId: string;
  status: string;
  message: string;
  sourceCount: number;
  suggestedPersonaCount: number;
}> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
  });
  if (!product) {
    throw new TenantError("Product not found in the active organization.");
  }

  const acquired = await acquireProductEvidence({
    organizationId: input.organizationId,
    productId: input.productId,
    userId: input.userId,
    sources: input.sources,
    forceUrlRefresh: input.forceUrlRefresh,
  });

  if (acquired.excerpts.length === 0) {
    await prisma.product.update({
      where: { id: product.id },
      data: { setupStatus: "FAILED" },
    });
    throw new TenantError(
      acquired.errors[0] ||
        "No usable evidence was acquired. Add a URL, notes, paste, or document.",
    );
  }

  const synth = await synthesizeProductSetup({
    organizationId: input.organizationId,
    productId: input.productId,
    userId: input.userId,
    evidenceBundleId: acquired.evidenceBundleId,
    correlationId: acquired.correlationId,
    excerpts: acquired.excerpts,
    productName: product.name,
    primaryUrl: product.websiteUrl,
  });

  if (synth.status === "FAILED") {
    return {
      evidenceBundleId: acquired.evidenceBundleId,
      setupRunId: synth.setupRunId,
      correlationId: acquired.correlationId,
      status: "FAILED",
      message:
        synth.errorSafe ||
        "Evidence was saved, but AI synthesis failed. You can retry synthesis without re-fetching URLs.",
      sourceCount: acquired.excerpts.length,
      suggestedPersonaCount: 0,
    };
  }

  return {
    evidenceBundleId: acquired.evidenceBundleId,
    setupRunId: synth.setupRunId,
    correlationId: acquired.correlationId,
    status: acquired.partial ? "PARTIAL" : "NEEDS_REVIEW",
    message: acquired.partial
      ? "Product draft ready for review (some sources failed)."
      : "Product draft ready for review.",
    sourceCount: acquired.excerpts.length,
    suggestedPersonaCount: synth.result?.suggestedPersonas.length ?? 0,
  };
}

/**
 * Progressive web search for Product Assisted Setup.
 * Discovery via Research AI web_search; fetch/persist via application.
 * PRODUCT_AI never browses.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import type { NormalizedRetrievedSource } from "@/lib/ai/types";
import { prisma } from "@/lib/prisma";
import { discoverSourcesViaWebSearch } from "@/lib/research/web-search-retriever";
import { recordUsageEvent } from "@/lib/usage/events";
import { fetchProductPageUrl } from "@/lib/product-research/fetch-url";
import type { EvidenceExcerpt } from "@/lib/product-research/prompt";
import {
  buildProductSearchFocus,
  evaluateProductEvidenceSufficiency,
  type ProductEvidenceDimensions,
} from "@/lib/product-research/sufficiency";
import {
  normalizeProductSourceUrl,
  sha256Hex,
} from "@/lib/product-research/url";

export type SourceQuality = "PRIMARY" | "HIGH" | "MEDIUM" | "LOW";

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function isFresh(expiresAt: Date | null | undefined): boolean {
  return Boolean(expiresAt && expiresAt.getTime() > Date.now());
}

function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export function classifyProductSourceQuality(input: {
  url: string;
  primaryDomain: string | null;
}): SourceQuality {
  let host = "";
  try {
    host = new URL(input.url).hostname.toLowerCase();
  } catch {
    return "LOW";
  }
  const bare = host.replace(/^www\./, "");
  if (input.primaryDomain && bare === input.primaryDomain) return "PRIMARY";
  if (input.primaryDomain && bare.endsWith(`.${input.primaryDomain}`)) {
    return "PRIMARY";
  }
  if (
    bare.includes("g2.com") ||
    bare.includes("capterra.com") ||
    bare.includes("trustradius.com") ||
    bare.includes("gartner.com") ||
    bare.includes("forrester.com")
  ) {
    return "HIGH";
  }
  if (
    bare.includes("techcrunch.com") ||
    bare.includes("forbes.com") ||
    bare.includes("wsj.com") ||
    bare.includes("reuters.com") ||
    bare.includes("bloomberg.com")
  ) {
    return "HIGH";
  }
  if (
    bare.includes("medium.com") ||
    bare.includes("linkedin.com") ||
    bare.includes("youtube.com")
  ) {
    return "MEDIUM";
  }
  return "LOW";
}

function qualityRank(q: SourceQuality): number {
  switch (q) {
    case "PRIMARY":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    default:
      return 1;
  }
}

export type ProgressiveSearchResult = {
  excerpts: EvidenceExcerpt[];
  sourceIds: string[];
  webSearchQueriesUsed: number;
  discoveredSourceCount: number;
  stoppedReason: "sufficient" | "max_queries" | "no_web_search" | "source_cap";
  errors: string[];
};

/**
 * After user sources are acquired, optionally run progressive web search
 * within ResearchPolicy budgets and merge discovered ProductSource rows.
 */
export async function runProgressiveProductWebSearch(input: {
  organizationId: string;
  productId: string;
  userId: string | null;
  correlationId: string;
  productName: string;
  primaryUrl: string | null;
  excerpts: EvidenceExcerpt[];
  sourceIds: string[];
  maxSearchQueries: number;
  maxSources: number;
  freshnessDays: number;
}): Promise<ProgressiveSearchResult> {
  const errors: string[] = [];
  let excerpts = [...input.excerpts];
  let sourceIds = [...input.sourceIds];
  let webSearchQueriesUsed = 0;
  let discoveredSourceCount = 0;
  let stoppedReason: ProgressiveSearchResult["stoppedReason"] = "sufficient";

  const primaryDomain = domainFromUrl(input.primaryUrl);
  const maxQueries = Math.max(0, input.maxSearchQueries);

  if (maxQueries === 0) {
    return {
      excerpts,
      sourceIds,
      webSearchQueriesUsed: 0,
      discoveredSourceCount: 0,
      stoppedReason: "no_web_search",
      errors,
    };
  }

  let sufficiency = evaluateProductEvidenceSufficiency({
    excerpts,
    productName: input.productName,
  });

  if (sufficiency.sufficient) {
    return {
      excerpts,
      sourceIds,
      webSearchQueriesUsed: 0,
      discoveredSourceCount: 0,
      stoppedReason: "sufficient",
      errors,
    };
  }

  let stages = 0;
  while (
    !sufficiency.sufficient &&
    webSearchQueriesUsed < maxQueries &&
    stages < maxQueries &&
    sourceIds.length < input.maxSources
  ) {
    // Pricing alone must never force another search.
    if (
      sufficiency.missingPrimary.length === 0 &&
      sufficiency.missingSecondary.every((k) => k === "pricing")
    ) {
      stoppedReason = "sufficient";
      break;
    }

    const focus = buildProductSearchFocus(
      input.productName,
      primaryDomain,
      sufficiency.missingPrimary,
      sufficiency.missingSecondary,
    );

    let discovery;
    try {
      discovery = await discoverSourcesViaWebSearch({
        productName: input.productName,
        primaryUrl: input.primaryUrl,
        domain: primaryDomain,
        searchFocus: focus,
        searchesRemaining: Math.max(0, maxQueries - webSearchQueriesUsed),
      });
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `Web search failed: ${error.message.slice(0, 160)}`
          : "Web search failed.",
      );
      stoppedReason = "no_web_search";
      break;
    }

    const calls = discovery.webSearchCalls > 0 ? discovery.webSearchCalls : 1;
    webSearchQueriesUsed += calls;
    stages += 1;

    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "PRODUCT_RESEARCH",
      operation: "PRODUCT_WEB_SEARCH",
      provider: discovery.provider,
      model: discovery.model,
      status:
        discovery.skippedReason || discovery.sources.length === 0
          ? "PARTIAL"
          : "SUCCESS",
      webSearchCalls: discovery.webSearchCalls || null,
      operationId: input.correlationId,
      metadata: {
        correlationId: input.correlationId,
        productId: input.productId,
        searchFocus: focus.slice(0, 300),
        discoveredCount: discovery.sources.length,
        skippedReason: discovery.skippedReason ?? null,
      },
    });

    if (discovery.skippedReason) {
      stoppedReason = "no_web_search";
      break;
    }

    // Prefer higher-quality sources first.
    const ranked = [...discovery.sources].sort(
      (a, b) =>
        qualityRank(
          classifyProductSourceQuality({
            url: b.url,
            primaryDomain,
          }),
        ) -
        qualityRank(
          classifyProductSourceQuality({
            url: a.url,
            primaryDomain,
          }),
        ),
    );

    let addedThisStage = 0;
    for (const discovered of ranked) {
      if (sourceIds.length >= input.maxSources) {
        stoppedReason = "source_cap";
        break;
      }

      const persisted = await persistDiscoveredProductSource({
        organizationId: input.organizationId,
        productId: input.productId,
        userId: input.userId,
        correlationId: input.correlationId,
        discovered,
        searchQuery: focus,
        primaryDomain,
        freshnessDays: input.freshnessDays,
        provider: discovery.provider,
        model: discovery.model,
      });

      if (persisted.errorSafe && !persisted.excerpt) {
        errors.push(persisted.errorSafe);
        continue;
      }

      if (persisted.sourceId && !sourceIds.includes(persisted.sourceId)) {
        sourceIds.push(persisted.sourceId);
      }
      if (persisted.excerpt && persisted.wasNewlyAcquired) {
        excerpts.push(persisted.excerpt);
        discoveredSourceCount += 1;
        addedThisStage += 1;
      } else if (persisted.excerpt && persisted.sourceId) {
        // Reused fresh source — include text if not already present
        if (!excerpts.some((e) => e.sourceId === persisted.sourceId)) {
          excerpts.push(persisted.excerpt);
        }
      }
    }

    sufficiency = evaluateProductEvidenceSufficiency({
      excerpts,
      productName: input.productName,
    });

    if (sufficiency.sufficient) {
      stoppedReason = "sufficient";
      break;
    }

    if (webSearchQueriesUsed >= maxQueries) {
      stoppedReason = "max_queries";
      break;
    }

    if (addedThisStage === 0 && discovery.sources.length === 0) {
      stoppedReason = "max_queries";
      break;
    }
  }

  if (!sufficiency.sufficient && webSearchQueriesUsed >= maxQueries) {
    stoppedReason = "max_queries";
  }

  // Cap and prefer PRIMARY/HIGH over LOW spam
  const rankedExcerpts = [...excerpts].sort((a, b) => {
    const qa = classifyProductSourceQuality({
      url: a.url || "",
      primaryDomain,
    });
    const qb = classifyProductSourceQuality({
      url: b.url || "",
      primaryDomain,
    });
    return qualityRank(qb) - qualityRank(qa);
  });

  const capped = rankedExcerpts.slice(0, input.maxSources);
  const cappedIds = [...new Set(capped.map((e) => e.sourceId))];

  return {
    excerpts: capped,
    sourceIds: cappedIds,
    webSearchQueriesUsed,
    discoveredSourceCount,
    stoppedReason,
    errors,
  };
}

async function persistDiscoveredProductSource(input: {
  organizationId: string;
  productId: string;
  userId: string | null;
  correlationId: string;
  discovered: NormalizedRetrievedSource;
  searchQuery: string;
  primaryDomain: string | null;
  freshnessDays: number;
  provider: string | null;
  model: string | null;
}): Promise<{
  sourceId: string | null;
  excerpt: EvidenceExcerpt | null;
  wasNewlyAcquired: boolean;
  errorSafe?: string;
}> {
  const normalized = normalizeProductSourceUrl(input.discovered.url);
  if (!normalized) {
    return {
      sourceId: null,
      excerpt: null,
      wasNewlyAcquired: false,
      errorSafe: "Discovered URL could not be normalized.",
    };
  }

  const existing = await prisma.productSource.findFirst({
    where: {
      organizationId: input.organizationId,
      productId: input.productId,
      normalizedUrlKey: normalized,
      status: { in: ["ACQUIRED", "EXTRACTED"] },
    },
    orderBy: { retrievedAt: "desc" },
  });

  if (existing && isFresh(existing.freshnessExpiresAt)) {
    return {
      sourceId: existing.id,
      excerpt: existing.extractedText
        ? {
            sourceId: existing.id,
            sourceType: "URL",
            displayName: existing.displayName,
            text: existing.extractedText,
            url: existing.originalUrl,
          }
        : null,
      wasNewlyAcquired: false,
    };
  }

  const fetched = await fetchProductPageUrl(normalized);
  if (!fetched.ok || !fetched.text) {
    return {
      sourceId: null,
      excerpt: null,
      wasNewlyAcquired: false,
      errorSafe: fetched.errorSafe || "Failed to retrieve discovered URL.",
    };
  }

  const hash = await sha256Hex(`url:${normalized}:${fetched.text}`);
  const dup = await prisma.productSource.findFirst({
    where: {
      organizationId: input.organizationId,
      productId: input.productId,
      contentHash: hash,
    },
  });
  if (dup) {
    return {
      sourceId: dup.id,
      excerpt: dup.extractedText
        ? {
            sourceId: dup.id,
            sourceType: "URL",
            displayName: dup.displayName,
            text: dup.extractedText,
            url: dup.originalUrl,
          }
        : null,
      wasNewlyAcquired: false,
    };
  }

  const quality = classifyProductSourceQuality({
    url: fetched.url,
    primaryDomain: input.primaryDomain,
  });

  const row = await prisma.productSource.create({
    data: {
      organizationId: input.organizationId,
      productId: input.productId,
      sourceType: "URL",
      displayName:
        input.discovered.title || fetched.title || normalized,
      originalUrl: fetched.url,
      normalizedUrlKey: normalized,
      acquisitionMethod: "WEB_SEARCH",
      createdByUserId: input.userId,
      retrievedAt: new Date(),
      contentHash: hash,
      status: "ACQUIRED",
      extractedText: fetched.text,
      freshnessExpiresAt: daysFromNow(input.freshnessDays),
      metadataJson: {
        searchQuery: input.searchQuery.slice(0, 500),
        publisher: input.discovered.publisher ?? null,
        sourceQuality: quality,
        provider: input.provider,
        model: input.model,
        correlationId: input.correlationId,
      } as Prisma.InputJsonValue,
    },
  });

  await recordUsageEvent({
    organizationId: input.organizationId,
    userId: input.userId,
    category: "PRODUCT_RESEARCH",
    operation: "PRODUCT_URL_RETRIEVAL",
    provider: input.provider,
    model: input.model,
    status: "SUCCESS",
    operationId: input.correlationId,
    metadata: {
      correlationId: input.correlationId,
      productId: input.productId,
      sourceId: row.id,
      acquisitionMethod: "WEB_SEARCH",
      sourceQuality: quality,
    },
  });

  return {
    sourceId: row.id,
    excerpt: {
      sourceId: row.id,
      sourceType: "URL",
      displayName: row.displayName,
      text: fetched.text,
      url: row.originalUrl,
    },
    wasNewlyAcquired: true,
  };
}

/** Exported for tests — type alias for dimension keys. */
export type { ProductEvidenceDimensions };

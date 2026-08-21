/**
 * Provider-independent web search discovery.
 * Uses Research AI (openai-responses + web_search) for discovery only.
 * Callers fetch/persist URLs themselves — Product AI never browses.
 */

import { z } from "zod";
import {
  getAiConfigPublicSummary,
  getResearchAiConfig,
  getResearchAiProvider,
  isResearchAiConfigured,
} from "@/lib/ai";
import type { NormalizedRetrievedSource } from "@/lib/ai/types";
import { assertSafeExternalHttpUrl } from "@/lib/research/url-safety";

const discoverySchema = z.object({
  /** Hints only — authoritative URLs come from retrievedSources. */
  notes: z.string().nullable().optional(),
});

export type WebSearchDiscoveryInput = {
  /** Human-readable product / company identity. */
  productName: string;
  primaryUrl?: string | null;
  domain?: string | null;
  /** Targeted gap focus from sufficiency evaluator. */
  searchFocus: string;
  searchesRemaining: number;
};

export type WebSearchDiscoveryResult = {
  sources: NormalizedRetrievedSource[];
  webSearchCalls: number;
  provider: string | null;
  model: string | null;
  skippedReason?: "not_configured" | "provider_unavailable";
};

function identityClause(input: WebSearchDiscoveryInput): string {
  const parts = [`Product name: ${input.productName}`];
  if (input.primaryUrl) parts.push(`Primary URL: ${input.primaryUrl}`);
  if (input.domain) parts.push(`Domain: ${input.domain}`);
  return parts.join("\n");
}

/**
 * Discover candidate web sources via Research AI web_search.
 * Only returns https? URLs from provider retrievedSources (never AI-invented).
 */
export async function discoverSourcesViaWebSearch(
  input: WebSearchDiscoveryInput,
): Promise<WebSearchDiscoveryResult> {
  if (!isResearchAiConfigured()) {
    return {
      sources: [],
      webSearchCalls: 0,
      provider: null,
      model: null,
      skippedReason: "not_configured",
    };
  }

  const config = getResearchAiConfig();
  if (config.provider !== "openai-responses") {
    return {
      sources: [],
      webSearchCalls: 0,
      provider: config.provider,
      model: config.model,
      skippedReason: "provider_unavailable",
    };
  }

  const summary = getAiConfigPublicSummary(config);
  const ai = getResearchAiProvider();

  const response = await ai.generateStructured({
    schema: discoverySchema,
    schemaName: "product_source_discovery",
    messages: [
      {
        role: "system",
        content: `You are a source-discovery assistant for product research.
Use web search to find official and high-quality pages about the named product/company.
Prefer the official product site, docs, pricing, case studies, and credible reviews.
Do NOT invent URLs. Do NOT research unrelated companies.
Searches remaining for this workflow: ${input.searchesRemaining}.
Return brief JSON notes only; URLs come from search tool sources.`,
      },
      {
        role: "user",
        content: `${identityClause(input)}

Search focus:
${input.searchFocus}

Find the best official/high-quality pages matching this focus.`,
      },
    ],
  });

  const raw = response.retrievedSources ?? [];
  const sources: NormalizedRetrievedSource[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const safety = assertSafeExternalHttpUrl(s.url);
    if (!safety.ok) continue;
    const key = safety.href.toLowerCase().replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      url: safety.href,
      title: s.title ?? null,
      publisher: s.publisher ?? null,
    });
  }

  return {
    sources,
    webSearchCalls: response.usage?.webSearchCalls ?? 0,
    provider: summary.provider,
    model: summary.model,
  };
}

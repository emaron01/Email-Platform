import type { NormalizedRetrievedSource } from "@/lib/ai/types";
import type {
  ResearchSource,
  ResearchSourceType,
} from "@/lib/research/types";
import type {
  RetrievedEvidenceBundle,
  SourceExcerpt,
} from "@/lib/research/sources";

function normalizeUrlKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return null;
  }
}

export function inferSourceType(url: string): ResearchSourceType {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  if (host.includes("linkedin.com")) return "LINKEDIN";
  if (
    host.includes("g2.com") ||
    host.includes("capterra.com") ||
    host.includes("trustradius.com")
  ) {
    return "REVIEW_SITE";
  }
  if (
    host.includes("crunchbase.com") ||
    host.includes("bloomberg.com") ||
    host.includes("reuters.com") ||
    host.includes("techcrunch.com") ||
    host.includes("wsj.com") ||
    host.includes("ft.com")
  ) {
    return "NEWS";
  }
  if (
    host.includes("zoominfo.com") ||
    host.includes("apollo.io") ||
    host.includes("dnb.com")
  ) {
    return "DIRECTORY";
  }
  return "OTHER";
}

export function normalizedToResearchSource(
  source: NormalizedRetrievedSource,
  retrievedAt = new Date().toISOString(),
): ResearchSource {
  return {
    url: source.url,
    title: source.title ?? null,
    publisher: source.publisher ?? null,
    sourceType: inferSourceType(source.url),
    retrievedAt,
    supports: [],
  };
}

/**
 * Merge evidence bundles and remove duplicate URLs.
 * Prefer first-seen metadata (website retriever typically first).
 */
export function mergeEvidenceBundles(
  ...bundles: RetrievedEvidenceBundle[]
): RetrievedEvidenceBundle {
  const sources: ResearchSource[] = [];
  const excerpts: SourceExcerpt[] = [];
  const seen = new Set<string>();

  for (const bundle of bundles) {
    for (const source of bundle.sources) {
      const key = normalizeUrlKey(source.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      sources.push(source);
    }
    for (const excerpt of bundle.excerpts) {
      const key = normalizeUrlKey(excerpt.url);
      if (!key) continue;
      // Allow one excerpt per URL
      if (excerpts.some((e) => normalizeUrlKey(e.url) === key)) continue;
      excerpts.push(excerpt);
    }
  }

  return { sources, excerpts };
}

export function evidenceFromNormalizedSources(
  sources: NormalizedRetrievedSource[],
): RetrievedEvidenceBundle {
  const retrievedAt = new Date().toISOString();
  return {
    sources: sources.map((s) => normalizedToResearchSource(s, retrievedAt)),
    excerpts: [],
  };
}

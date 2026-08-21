import type {
  CompanyResearchInput,
  ResearchSource,
} from "@/lib/research/types";

export type SourceExcerpt = {
  url: string;
  title: string | null;
  text: string;
};

export type RetrievedEvidenceBundle = {
  sources: ResearchSource[];
  excerpts: SourceExcerpt[];
};

/**
 * Abstract source retrieval — keeps CompanyResearch independent of
 * vendor-specific browsing features.
 */
export interface CompanySourceRetriever {
  retrieve(input: CompanyResearchInput): Promise<RetrievedEvidenceBundle>;
}

function normalizeWebsiteCandidate(
  website: string | null,
  domain: string | null,
): string | null {
  if (website?.trim()) {
    const value = website.trim();
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    return `https://${value.replace(/^\/\//, "")}`;
  }
  if (domain?.trim()) return `https://${domain.trim()}`;
  return null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match?.[1]) return null;
  return match[1].replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

function htmlToTextSnippet(html: string, maxLen = 4000): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const text = withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maxLen);
}

/**
 * Default retriever: fetch the company website when a URL/domain is known.
 * Does not invent URLs. Returns an empty bundle when nothing can be retrieved.
 */
export class WebsiteSourceRetriever implements CompanySourceRetriever {
  constructor(private readonly timeoutMs = 12_000) {}

  async retrieve(input: CompanyResearchInput): Promise<RetrievedEvidenceBundle> {
    const url = normalizeWebsiteCandidate(input.website, input.normalizedDomain);
    if (!url) {
      return { sources: [], excerpts: [] };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "EmailPlatformCompanyResearch/1.0",
        },
      });

      if (!response.ok) {
        return { sources: [], excerpts: [] };
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (
        contentType &&
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml") &&
        !contentType.includes("text/plain")
      ) {
        return { sources: [], excerpts: [] };
      }

      const html = await response.text();
      const title = extractTitle(html);
      const text = htmlToTextSnippet(html);
      if (!text) {
        return { sources: [], excerpts: [] };
      }

      const retrievedAt = new Date().toISOString();
      const source: ResearchSource = {
        url: response.url || url,
        title,
        publisher: null,
        sourceType: "COMPANY_WEBSITE",
        retrievedAt,
        supports: [],
      };

      return {
        sources: [source],
        excerpts: [{ url: source.url, title, text }],
      };
    } catch {
      return { sources: [], excerpts: [] };
    } finally {
      clearTimeout(timer);
    }
  }
}

let activeRetriever: CompanySourceRetriever = new WebsiteSourceRetriever();

export function setCompanySourceRetriever(
  retriever: CompanySourceRetriever,
): void {
  activeRetriever = retriever;
}

export function getCompanySourceRetriever(): CompanySourceRetriever {
  return activeRetriever;
}

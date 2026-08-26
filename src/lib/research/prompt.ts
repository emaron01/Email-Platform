import type { AiMessage } from "@/lib/ai/types";
import { RESEARCH_PROMPT_VERSION } from "@/lib/research/config";
import type { CompanyResearchInput } from "@/lib/research/types";
import type { RetrievedEvidenceBundle } from "@/lib/research/sources";

export function buildCompanyResearchMessages(input: {
  company: CompanyResearchInput;
  evidence: RetrievedEvidenceBundle;
  webSearchEnabled: boolean;
  searchFocus?: string | null;
  stage?: "initial" | "follow_up" | "final_synthesis";
  searchesRemaining?: number;
}): AiMessage[] {
  const system = `You are a production company research analyst.
Prompt version: ${RESEARCH_PROMPT_VERSION}

Your job is to produce reusable, product-independent company intelligence.

CRITICAL RULES:
1. Search before assuming uncertain company facts${input.webSearchEnabled ? " (web_search tool is enabled — use it when needed)" : ""}.
2. Prefer primary sources: official website, product/pricing pages, docs, press releases.
3. Use multiple sources when useful; resolve contradictions when possible.
4. Clearly represent uncertainty. Do not invent pricing, AOV, technologies, customers, or markets.
5. Do NOT cite URLs that were not returned by web search / provided evidence.
6. Stop when further research is unlikely to materially improve the result. Do not chase AOV alone.
7. Do NOT evaluate Product / ICP / Persona / Campaign fit — that is scoring.
8. If company identity is ambiguous (common name, unclear domain), set identityCertainty to AMBIGUOUS, confidence LOW, and leave unsupported fields null.
9. Estimated AOV only when credible evidence exists — prefer ranges (e.g. $25K–$75K). If insufficient, estimatedAov=null and explain in aovReasoning.
10. Return a single JSON object matching the schema.
11. The application owns the search budget. Do not request unbounded follow-up searches.

Source priority: official company pages > reputable business/tech publications > review sites/directories. Do not elevate thin SEO pages to HIGH confidence.`;

  const user = JSON.stringify(
    {
      instruction:
        input.stage === "follow_up"
          ? "Perform a targeted follow-up search for missing company research dimensions. Avoid repeating prior broad searches."
          : input.webSearchEnabled
            ? "Research this company. Answer: what they sell, who they sell to, markets, business model, relevant technologies, public buying/growth signals, public risk signals, and whether credible AOV/deal-size evidence exists."
            : "Synthesize company research from the supplied first-party website evidence only. Do not invent facts absent from that evidence. If the evidence is thin, leave fields null/empty and set confidence LOW — the application will run web search only when needed.",
      searchFocus: input.searchFocus ?? null,
      stage: input.stage ?? "initial",
      searchesRemaining: input.searchesRemaining ?? null,
      company: {
        name: input.company.name,
        website: input.company.website,
        normalizedDomain: input.company.normalizedDomain,
        industry: input.company.industry,
        employeeCount: input.company.employeeCount,
        location: input.company.location,
      },
      firstPartyEvidenceSources: input.evidence.sources,
      firstPartyEvidenceExcerpts: input.evidence.excerpts,
      webSearchEnabled: input.webSearchEnabled,
      responseSchema: {
        companySummary: "string|null",
        whatTheySell: "string|null",
        customerTypes: ["string"],
        primaryMarkets: ["string"],
        businessModel: "string|null",
        estimatedAov: "string|null e.g. $25K–$75K or null",
        aovReasoning: "string|null",
        companySizeContext: "string|null",
        relevantTechnologies: ["string"],
        buyingSignals: ["string"],
        riskSignals: ["string"],
        confidence: "HIGH|MEDIUM|LOW",
        identityCertainty: "HIGH|MEDIUM|LOW|AMBIGUOUS",
        sources: [
          {
            url: "must match a retrieved web-search or first-party evidence URL",
            title: "string|null",
            publisher: "string|null",
            sourceType:
              "COMPANY_WEBSITE|LINKEDIN|NEWS|DIRECTORY|REVIEW_SITE|OTHER",
            retrievedAt: "ISO string",
            supports: ["field or finding names"],
          },
        ],
      },
    },
    null,
    2,
  );

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

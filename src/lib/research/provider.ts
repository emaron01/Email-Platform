import {
  getResearchAiConfig,
  getResearchAiProvider,
  isResearchAiConfigured,
} from "@/lib/ai";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import {
  AiConfigError,
  AiProviderError,
  AiTimeoutError,
  AiValidationError,
} from "@/lib/ai/errors";
import { RESEARCH_PROMPT_VERSION } from "@/lib/research/config";
import {
  evidenceFromNormalizedSources,
  mergeEvidenceBundles,
} from "@/lib/research/evidence";
import { buildCompanyResearchMessages } from "@/lib/research/prompt";
import { getCompanySourceRetriever } from "@/lib/research/sources";
import {
  buildTargetedSearchFocus,
  evaluateEvidenceSufficiency,
} from "@/lib/research/sufficiency";
import {
  categorizeResearchError,
  logResearchTelemetry,
} from "@/lib/research/telemetry";
import type {
  CompanyResearchInput,
  CompanyResearchProvider,
  CompanyResearchResult,
  CompanyResearchProvenance,
  ResearchSource,
} from "@/lib/research/types";
import {
  assertResearchConfidenceAllowed,
  validateCompanyResearchResult,
} from "@/lib/research/validate";
import { DEFAULT_RESEARCH_POLICY_VALUES } from "@/lib/usage/defaults";

export type ResearchUsageSnapshot = {
  inputTokens: number | null;
  outputTokens: number | null;
  webSearchCallCount: number | null;
  researchDurationMs: number | null;
};

export type AutomatedCompanyResearchResult = CompanyResearchResult & {
  provenance: CompanyResearchProvenance;
  usage?: ResearchUsageSnapshot;
  identityAmbiguous?: boolean;
  searchStagesUsed?: number;
  stoppedReason?: "sufficient" | "max_queries" | "no_web_search";
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AiTimeoutError) return true;
  if (error instanceof AiProviderError) return error.retryable;
  return false;
}

async function withRetries<T>(
  fn: () => Promise<T>,
  maxRetries: number,
): Promise<{ value: T; retries: number }> {
  let attempt = 0;
  while (true) {
    try {
      return { value: await fn(), retries: attempt };
    } catch (error) {
      if (
        error instanceof AiValidationError ||
        error instanceof AiConfigError
      ) {
        throw error;
      }
      if (!isRetryable(error) || attempt >= maxRetries) throw error;
      const delay = Math.min(2000 * 2 ** attempt, 8000);
      await sleep(delay);
      attempt += 1;
    }
  }
}

function dedupeSources(sources: ResearchSource[]): ResearchSource[] {
  const seen = new Set<string>();
  const out: ResearchSource[] = [];
  for (const s of sources) {
    const key = s.url.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Progressive evidence acquisition:
 * Known data → website → initial search → sufficiency → targeted follow-ups
 * (bounded by Organization ResearchPolicy.maxSearchQueriesPerCompany).
 *
 * Application owns whether another search is permitted.
 * Research AI synthesizes; it does not own unbounded search spend.
 */
export class AiCompanyResearchProvider implements CompanyResearchProvider {
  async research(
    input: CompanyResearchInput,
  ): Promise<AutomatedCompanyResearchResult> {
    const started = Date.now();
    const config = getResearchAiConfig();
    let retries = 0;
    let totalInputTokens: number | null = null;
    let totalOutputTokens: number | null = null;
    let totalWebSearchCalls = 0;
    let searchStagesUsed = 0;
    let stoppedReason: AutomatedCompanyResearchResult["stoppedReason"] =
      "no_web_search";

    const depth = input.depthPolicy ?? {
      maxSearchQueriesPerCompany:
        DEFAULT_RESEARCH_POLICY_VALUES.maxSearchQueriesPerCompany,
      maxSourcesPerCompany: DEFAULT_RESEARCH_POLICY_VALUES.maxSourcesPerCompany,
      researchFreshnessDays:
        DEFAULT_RESEARCH_POLICY_VALUES.researchFreshnessDays,
    };

    try {
      const ai = getResearchAiProvider();
      const retriever = getCompanySourceRetriever();
      const websiteEvidence = await retriever.retrieve(input);
      const webSearchEnabled = config.provider === "openai-responses";

      let evidence = websiteEvidence;
      let lastValidated: CompanyResearchResult | null = null;
      let identityAmbiguous = false;

      const maxQueries = Math.max(1, depth.maxSearchQueriesPerCompany);

      const runStage = async (opts: {
        stage: "initial" | "follow_up";
        searchFocus?: string | null;
        searchesRemaining: number;
      }): Promise<CompanyResearchResult> => {
        const { value: response, retries: usedRetries } = await withRetries(
          () =>
            ai.generateStructured({
              ...structuredOutputRequest("companyResearch"),
              messages: buildCompanyResearchMessages({
                company: input,
                evidence,
                webSearchEnabled,
                searchFocus: opts.searchFocus,
                stage: opts.stage,
                searchesRemaining: opts.searchesRemaining,
              }),
            }),
          config.maxRetries,
        );
        retries += usedRetries;
        searchStagesUsed += 1;

        if (response.usage?.inputTokens != null) {
          totalInputTokens =
            (totalInputTokens ?? 0) + response.usage.inputTokens;
        }
        if (response.usage?.outputTokens != null) {
          totalOutputTokens =
            (totalOutputTokens ?? 0) + response.usage.outputTokens;
        }
        if (response.usage?.webSearchCalls != null) {
          totalWebSearchCalls += response.usage.webSearchCalls;
        } else if (webSearchEnabled) {
          totalWebSearchCalls += 1;
        }

        const webEvidence = evidenceFromNormalizedSources(
          response.retrievedSources ?? [],
        );
        evidence = mergeEvidenceBundles(evidence, webEvidence);

        const validated = validateCompanyResearchResult(
          response.data,
          evidence,
        );
        assertResearchConfidenceAllowed(validated);
        const next: CompanyResearchResult = {
          ...validated,
          sources: dedupeSources(validated.sources).slice(
            0,
            depth.maxSourcesPerCompany,
          ),
        };
        lastValidated = next;
        identityAmbiguous = response.data.identityCertainty === "AMBIGUOUS";
        return next;
      };

      if (!webSearchEnabled) {
        await runStage({
          stage: "initial",
          searchesRemaining: 0,
        });
        stoppedReason = "no_web_search";
      } else {
        let current = await runStage({
          stage: "initial",
          searchesRemaining: maxQueries - 1,
        });

        let sufficiency = evaluateEvidenceSufficiency({
          sources: current.sources,
          fields: current,
          maxSourcesPerCompany: depth.maxSourcesPerCompany,
        });

        while (
          !sufficiency.sufficient &&
          totalWebSearchCalls < maxQueries &&
          searchStagesUsed < maxQueries
        ) {
          if (
            sufficiency.missingPrimary.length === 0 &&
            sufficiency.missingSecondary.every((k) => k === "estimatedAov")
          ) {
            break;
          }

          const focus = buildTargetedSearchFocus(
            sufficiency.missingPrimary,
            sufficiency.missingSecondary,
          );
          current = await runStage({
            stage: "follow_up",
            searchFocus: focus,
            searchesRemaining: Math.max(0, maxQueries - totalWebSearchCalls),
          });
          sufficiency = evaluateEvidenceSufficiency({
            sources: current.sources,
            fields: current,
            maxSourcesPerCompany: depth.maxSourcesPerCompany,
          });
        }

        stoppedReason = sufficiency.sufficient ? "sufficient" : "max_queries";
      }

      if (!lastValidated) {
        throw new AiValidationError("Research produced no validated result.");
      }

      const finalized: CompanyResearchResult = lastValidated;

      const result: AutomatedCompanyResearchResult = {
        ...finalized,
        ...(identityAmbiguous
          ? {
              confidence: "LOW" as const,
              companySummary:
                finalized.companySummary ??
                "Company identity is ambiguous; research is incomplete.",
            }
          : {}),
        provenance: {
          aiProvider: config.provider,
          aiModel: config.model,
          aiModelUrlIdentifier: config.modelUrlIdentifier,
          promptVersion: RESEARCH_PROMPT_VERSION,
        },
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          webSearchCallCount: webSearchEnabled ? totalWebSearchCalls : null,
          researchDurationMs: Date.now() - started,
        },
        identityAmbiguous,
        searchStagesUsed,
        stoppedReason,
      };

      logResearchTelemetry({
        event: "company_research_job",
        companyId: input.companyId,
        organizationId: input.organizationId,
        provider: config.provider,
        model: config.model,
        durationMs: Date.now() - started,
        webSearchCalls: result.usage?.webSearchCallCount ?? null,
        sourceCount: result.sources.length,
        status:
          identityAmbiguous || result.sources.length === 0
            ? "PARTIAL"
            : "COMPLETED",
        retries,
        errorCategory: null,
      });

      return result;
    } catch (error) {
      logResearchTelemetry({
        event: "company_research_job",
        companyId: input.companyId,
        organizationId: input.organizationId,
        provider: config.provider,
        model: config.model,
        durationMs: Date.now() - started,
        webSearchCalls: null,
        sourceCount: 0,
        status: "FAILED",
        retries,
        errorCategory: categorizeResearchError(error),
      });
      throw error;
    }
  }
}

/**
 * Default: unconfigured until Research AI env is present.
 * Intentionally does not fabricate company intelligence.
 */
export class UnconfiguredCompanyResearchProvider implements CompanyResearchProvider {
  async research(_input: CompanyResearchInput): Promise<CompanyResearchResult> {
    throw new AiConfigError(
      "Automated company research is not configured. Use manual research or set RESEARCH_AI_* environment variables.",
    );
  }
}

let overrideProvider: CompanyResearchProvider | null = null;

export function setCompanyResearchProvider(
  provider: CompanyResearchProvider | null,
): void {
  overrideProvider = provider;
}

export function getCompanyResearchProvider(): CompanyResearchProvider {
  if (overrideProvider) return overrideProvider;
  if (isResearchAiConfigured()) {
    return new AiCompanyResearchProvider();
  }
  return new UnconfiguredCompanyResearchProvider();
}

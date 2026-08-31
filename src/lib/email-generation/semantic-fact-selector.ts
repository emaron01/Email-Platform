import "server-only";

import {
  AiConfigError,
  AiProviderError,
  AiTimeoutError,
  AiValidationError,
  getEmailFactsAiConfig,
  getEmailFactsAiProvider,
} from "@/lib/ai";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { EmailFactSelectionResult } from "@/lib/email-generation/fact-selection-contract";
import type { EmailCompanyResearch } from "@/lib/email-generation/company-research-use";
import {
  buildFactSelectionCacheKey,
  fingerprintStringList,
  getCachedFactSelection,
  setCachedFactSelection,
  type FactSelectionCacheKeyParts,
} from "@/lib/email-generation/fact-selection-cache";
import {
  collectMotionSpecificCandidates,
  type MotionSpecificCandidate,
  type RequiredMotionSpecific,
} from "@/lib/email-generation/motion-specifics";
import { isUsableCompanyResearch } from "@/lib/email-generation/personalization";

export type FactSelectionSkipReason =
  | "EMAIL_FACTS_AI not configured"
  | "no usable company research"
  | "no structural candidates";

export type FactSelectionUsage = {
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cached: boolean;
  durationMs: number;
  skipReason?: FactSelectionSkipReason | null;
};

export type FactSelectionResult = {
  specifics: RequiredMotionSpecific[];
  noneRelevant: boolean;
  usage: FactSelectionUsage;
  cacheKey: string | null;
  skipReason: FactSelectionSkipReason | null;
  candidateCount: number;
};

export type SelectRelevantCompanyFactsInput = {
  organizationId: string;
  companyId: string;
  productId: string;
  personaId: string;
  contactTitle?: string | null;
  /** Optional draft id when known (regeneration); logged when present. */
  draftId?: string | null;
  product: {
    problemsSolved: string[];
  };
  persona: {
    name: string;
    painPoints: string[];
    desiredOutcomes: string[];
  };
  research: EmailCompanyResearch | null;
  researchUpdatedAt?: string | null;
  skipCache?: boolean;
};

export function buildFactSelectionFingerprints(input: {
  research: EmailCompanyResearch;
  researchUpdatedAt?: string | null;
  product: { problemsSolved: string[] };
  persona: { painPoints: string[]; desiredOutcomes: string[] };
}): Pick<
  FactSelectionCacheKeyParts,
  "researchFingerprint" | "productFingerprint" | "personaFingerprint"
> {
  return {
    researchFingerprint: fingerprintStringList([
      input.research.whatTheySell ?? "",
      ...input.research.customerTypes,
      ...input.research.primaryMarkets,
      input.research.businessModel ?? "",
      input.researchUpdatedAt ?? "",
    ]),
    productFingerprint: fingerprintStringList(input.product.problemsSolved),
    personaFingerprint: fingerprintStringList([
      ...input.persona.painPoints,
      ...input.persona.desiredOutcomes,
    ]),
  };
}

function indexedCandidates(
  research: EmailCompanyResearch,
): Array<MotionSpecificCandidate & { id: string }> {
  return collectMotionSpecificCandidates(research).map((candidate, index) => ({
    ...candidate,
    id: `c${index}`,
  }));
}

function mapSelectionToSpecifics(
  candidates: Array<MotionSpecificCandidate & { id: string }>,
  selection: EmailFactSelectionResult,
): RequiredMotionSpecific[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const specifics: RequiredMotionSpecific[] = [];
  for (const row of selection.selected) {
    const candidate = byId.get(row.candidateId);
    if (!candidate) continue;
    specifics.push({
      text: candidate.text,
      sourceField: candidate.sourceField,
      whyItMatters: row.rationale.trim(),
    });
    if (specifics.length >= 3) break;
  }
  return specifics;
}

function buildFactSelectionMessages(input: {
  product: SelectRelevantCompanyFactsInput["product"];
  persona: SelectRelevantCompanyFactsInput["persona"];
  contactTitle?: string | null;
  candidates: Array<MotionSpecificCandidate & { id: string }>;
}): [{ role: "system"; content: string }, { role: "user"; content: string }] {
  const system = `You select company-research facts for outbound email personalization.

Selection criterion — NOT "what is distinctive about this company":
Choose only facts that suggest THIS persona has THIS problem that THIS product solves.

Intersection to apply:
1. Persona painPoints and desiredOutcomes — what this role struggles with and wants
2. Product problemsSolved — what the product fixes
3. Company research candidates — evidence this prospect plausibly has that problem

Rules:
- Select 0–3 candidate facts. Returning zero is valid when none bridge company evidence to the persona's problem and product's problemsSolved.
- Do NOT select a fact merely because it is distinctive, well-known, or names many products.
- Semantic relevance counts: facts can connect without sharing words (e.g. a distributed customer base can evidence multi-site operations pain even when painPoints use different vocabulary).
- Every selected fact needs a one-line rationale explaining how it suggests this persona has the problem at this company.
- Use only candidate ids from the supplied list. Do not invent facts.
- Set noneRelevant true only when selected is empty.

Return JSON only matching the schema.`;

  const user = JSON.stringify(
    {
      contactTitle: input.contactTitle ?? null,
      persona: {
        name: input.persona.name,
        painPoints: input.persona.painPoints,
        desiredOutcomes: input.persona.desiredOutcomes,
      },
      product: {
        problemsSolved: input.product.problemsSolved,
      },
      candidates: input.candidates.map((candidate) => ({
        id: candidate.id,
        sourceField: candidate.sourceField,
        text: candidate.text,
      })),
    },
    null,
    2,
  );

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AiTimeoutError) return true;
  if (error instanceof AiProviderError) return error.retryable;
  return false;
}

function logFactSelection(input: {
  organizationId: string;
  companyId: string;
  draftId?: string | null;
  message: string;
  candidateCount?: number;
  selectedCount?: number;
}): void {
  console.info("[email-fact-selection]", {
    message: input.message,
    organizationId: input.organizationId,
    companyId: input.companyId,
    draftId: input.draftId ?? null,
    candidateCount: input.candidateCount ?? null,
    selectedCount: input.selectedCount ?? null,
  });
}

function skippedResult(input: {
  organizationId: string;
  companyId: string;
  draftId?: string | null;
  skipReason: FactSelectionSkipReason;
  cacheKey: string | null;
  candidateCount: number;
}): FactSelectionResult {
  logFactSelection({
    organizationId: input.organizationId,
    companyId: input.companyId,
    draftId: input.draftId,
    message: `fact selection skipped: ${input.skipReason}`,
    candidateCount: input.candidateCount,
    selectedCount: 0,
  });
  return {
    specifics: [],
    noneRelevant: true,
    usage: {
      provider: "skipped",
      model: "skipped",
      inputTokens: 0,
      outputTokens: 0,
      cached: false,
      durationMs: 0,
      skipReason: input.skipReason,
    },
    cacheKey: input.cacheKey,
    skipReason: input.skipReason,
    candidateCount: input.candidateCount,
  };
}

export async function selectRelevantCompanyFacts(
  input: SelectRelevantCompanyFactsInput,
): Promise<FactSelectionResult> {
  if (!input.research || !isUsableCompanyResearch(input.research)) {
    return skippedResult({
      organizationId: input.organizationId,
      companyId: input.companyId,
      draftId: input.draftId,
      skipReason: "no usable company research",
      cacheKey: null,
      candidateCount: 0,
    });
  }

  const candidates = indexedCandidates(input.research);
  if (candidates.length === 0) {
    return skippedResult({
      organizationId: input.organizationId,
      companyId: input.companyId,
      draftId: input.draftId,
      skipReason: "no structural candidates",
      cacheKey: null,
      candidateCount: 0,
    });
  }

  const fingerprints = buildFactSelectionFingerprints({
    research: input.research,
    researchUpdatedAt: input.researchUpdatedAt,
    product: input.product,
    persona: input.persona,
  });
  const cacheKey = buildFactSelectionCacheKey({
    organizationId: input.organizationId,
    companyId: input.companyId,
    productId: input.productId,
    personaId: input.personaId,
    ...fingerprints,
  });

  if (!input.skipCache) {
    const cached = getCachedFactSelection(cacheKey);
    if (cached) {
      logFactSelection({
        organizationId: input.organizationId,
        companyId: input.companyId,
        draftId: input.draftId,
        message: `fact selection ran: ${candidates.length} candidates, ${cached.specifics.length} selected`,
        candidateCount: candidates.length,
        selectedCount: cached.specifics.length,
      });
      return {
        specifics: cached.specifics,
        noneRelevant: cached.noneRelevant,
        usage: {
          provider: "cache",
          model: "cache",
          inputTokens: 0,
          outputTokens: 0,
          cached: true,
          durationMs: 0,
          skipReason: null,
        },
        cacheKey,
        skipReason: null,
        candidateCount: candidates.length,
      };
    }
  }

  let config;
  try {
    config = getEmailFactsAiConfig();
  } catch (error) {
    if (error instanceof AiConfigError) {
      return skippedResult({
        organizationId: input.organizationId,
        companyId: input.companyId,
        draftId: input.draftId,
        skipReason: "EMAIL_FACTS_AI not configured",
        cacheKey,
        candidateCount: candidates.length,
      });
    }
    throw error;
  }

  const started = Date.now();
  const ai = getEmailFactsAiProvider();
  const messages = buildFactSelectionMessages({
    product: input.product,
    persona: input.persona,
    contactTitle: input.contactTitle,
    candidates,
  });

  let attempt = 0;
  let response;
  while (true) {
    try {
      response = await ai.generateStructured({
        ...structuredOutputRequest("emailCompanyFactSelection"),
        messages,
      });
      break;
    } catch (error) {
      if (
        error instanceof AiValidationError ||
        error instanceof AiConfigError
      ) {
        throw error;
      }
      if (!isRetryable(error) || attempt >= config.maxRetries) throw error;
      await sleep(Math.min(2000 * 2 ** attempt, 8000));
      attempt += 1;
    }
  }

  const selection = response.data;
  const normalized: EmailFactSelectionResult =
    selection.noneRelevant || selection.selected.length === 0
      ? { noneRelevant: true, selected: [] }
      : {
          noneRelevant: false,
          selected: selection.selected,
        };

  const specifics = normalized.noneRelevant
    ? []
    : mapSelectionToSpecifics(candidates, normalized);

  const entry = {
    specifics,
    noneRelevant: specifics.length === 0,
  };
  setCachedFactSelection(cacheKey, entry);

  logFactSelection({
    organizationId: input.organizationId,
    companyId: input.companyId,
    draftId: input.draftId,
    message: `fact selection ran: ${candidates.length} candidates, ${specifics.length} selected`,
    candidateCount: candidates.length,
    selectedCount: specifics.length,
  });

  return {
    specifics,
    noneRelevant: entry.noneRelevant,
    usage: {
      provider: response.provider,
      model: response.model,
      inputTokens: response.usage?.inputTokens ?? null,
      outputTokens: response.usage?.outputTokens ?? null,
      cached: false,
      durationMs: Date.now() - started,
      skipReason: null,
    },
    cacheKey,
    skipReason: null,
    candidateCount: candidates.length,
  };
}

/** Rough marginal cost estimate for one fact-selection call (USD). */
export function estimateFactSelectionCostUsd(usage: FactSelectionUsage): number {
  if (usage.cached || usage.provider === "skipped") return 0;
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  return (input * 0.15 + output * 0.6) / 1_000_000;
}

import type { AiMessage } from "@/lib/ai/types";
import { PRODUCT_SYNTHESIS_PROMPT_VERSION } from "@/lib/product-research/contract";

export type EvidenceExcerpt = {
  sourceId: string;
  sourceType: string;
  displayName: string;
  text: string;
  url?: string | null;
};

export function buildProductSynthesisMessages(input: {
  productName: string;
  primaryUrl: string | null;
  excerpts: EvidenceExcerpt[];
}): AiMessage[] {
  const system = `You are a production Product setup synthesis engine.
Prompt version: ${PRODUCT_SYNTHESIS_PROMPT_VERSION}

You receive an EVIDENCE BUNDLE about a product. Produce ONE structured JSON response with:
- productDraft (factual product profile)
- productMessagingDraft (messaging guidance — NOT scoring evidence)
- personas (array of canonical buyer/user/influencer personas supported by evidence)

Each personas[] item MUST include:
- name: concise non-empty persona/role name (required). Examples: "Chief Revenue Officer", "Sales Leadership", "Revenue Operations Leader", "IT Infrastructure Leader". Role clusters are OK; a literal job title is not required.
- likelyTitles, function, seniority, whyThisPersonaMatters
- responsibilities, ownershipAreas, painPoints, desiredOutcomesFromSolution
- positiveSignals, negativeSignals, messagingNotes, confidence
- evidenceRefs where practical

Do NOT return suggestionKey (application-owned identity).
Do NOT return separate suggestedPersonas / personaDrafts arrays — only personas[].

RULES:
1. Do NOT fabricate pricing, customers, integrations, certifications, ROI, market share, or capabilities not supported by evidence.
2. Unknown is acceptable — list unknown/unsupported fields in productDraft.unknownFields.
3. Desired Outcomes From Your Solution = business/operational outcomes buyers want — NEVER campaign CTAs (meeting, demo, reply).
4. Title Match ≠ Role Match. Titles are weak evidence; responsibilities/ownership drive role fit.
5. Do NOT duplicate product messaging blindly into every persona — persona messaging is role-specific.
6. Messaging drafts must NOT be treated as factual scoring criteria.
7. Do NOT score contacts. Do NOT invent numeric fit scores.
8. Keep criteria concise and atomic — never paste multi-paragraph prose into a single criterion.
9. Cite evidence via evidenceRefs / sourceIds where practical for major claims.
10. Every persona.name must be a non-empty string after trimming.
11. Return JSON matching the schema only.`;

  const user = JSON.stringify({
    productName: input.productName,
    primaryUrl: input.primaryUrl,
    evidence: input.excerpts.map((e) => ({
      sourceId: e.sourceId,
      sourceType: e.sourceType,
      displayName: e.displayName,
      url: e.url ?? null,
      text: e.text.slice(0, 12_000),
    })),
    domainsAbsent: ["campaign", "offer", "cta", "contactScoring", "emailGeneration"],
  });

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

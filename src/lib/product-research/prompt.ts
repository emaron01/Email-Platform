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

Produce ONE structured JSON response with ONLY:
- productDraft (concise factual product profile)
- productMessagingDraft (messaging guidance — NOT scoring evidence)
- suggestedBuyerRoles (lightweight likely buyer/user/influencer roles)

Each suggestedBuyerRoles[] item MUST include:
- name: concise non-empty role name (e.g. "Chief Revenue Officer", "Revenue Operations Leader")
- likelyTitles[], departmentFunction, whyThisRoleMatters, confidence
- evidenceRefs where practical

Do NOT return suggestionKey (application-owned).
Do NOT return personas[], personaDrafts[], or complete Persona profiles.
Buyer roles are recommendations only — keep them short (2–4 sentences of whyThisRoleMatters max).

RULES:
1. Do NOT fabricate unsupported facts. Unknown → productDraft.unknownFields.
2. Keep productDraft concise for reliable synchronous synthesis.
3. Messaging drafts are guidance, not scoring criteria.
4. Do NOT score contacts or invent fit scores.
5. Return JSON matching the schema only.`;

  const user = JSON.stringify({
    productName: input.productName,
    primaryUrl: input.primaryUrl,
    evidence: input.excerpts.map((e) => ({
      sourceId: e.sourceId,
      sourceType: e.sourceType,
      displayName: e.displayName,
      url: e.url ?? null,
      text: e.text.slice(0, 8_000),
    })),
    domainsAbsent: [
      "campaign",
      "offer",
      "cta",
      "contactScoring",
      "emailGeneration",
      "fullPersonaDrafts",
    ],
  });

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

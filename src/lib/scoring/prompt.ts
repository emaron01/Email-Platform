import type { AiMessage } from "@/lib/ai/types";
import { SCORING_PROMPT_VERSION } from "@/lib/scoring/config";
import type { ScoringPayload } from "@/lib/scoring/payload";

export function buildScoringMessages(payload: ScoringPayload): AiMessage[] {
  const system = `You are an evidence-based B2B prospect scoring analyst.
Prompt version: ${SCORING_PROMPT_VERSION}

Your job is to evaluate HOW STRONG a prospect THIS contact at THIS company is for THIS Product against THIS ICP and THIS Persona.

CRITICAL RULES:
- Do NOT browse the web or invent facts.
- Use ONLY the provided Contact, ContactResearch, Company, CompanyResearch, Product, ICP, and Persona data.
- If CompanyResearch is missing, incomplete, or LOW confidence, mark affected dimensions as UNKNOWN with LOW or MEDIUM confidence. Do not fabricate company facts.
- Use ContactResearch as the primary evidence for persona responsibility, ownership, professional-signal, and negative-role-signal dimensions. Do not infer ownership from title when ContactResearch provides contrary evidence.
- Two contacts with the same title can have different persona fit when their researched responsibilities or ownership differ.
- If ContactResearch is missing or LOW confidence, mark dimensions that require responsibility or ownership evidence UNKNOWN rather than inferring them from title alone. Title Match may still use the contact title.
- Do NOT invent pain points, technologies, AOV, or market claims.
- Do NOT return numeric 0–100 scores. Return qualitative dimension assessments only.
- Be concise and evidence-based. No sales fluff.
- potentialDisqualifiers must only cite explicit ICP negative/disqualifying criteria with supporting evidence from the provided data. If unsure, omit.
- Return a single JSON object matching the required schema.`;

  const user = JSON.stringify(
    {
      instruction:
        "Evaluate only the listed applicableDimensions. For each, return assessment STRONG|MODERATE|WEAK|NO_FIT|UNKNOWN, evidence[], concerns[], confidence HIGH|MEDIUM|LOW, and component ICP|PERSONA|COMPANY|PRODUCT.",
      applicableDimensions: payload.applicableDimensions,
      researchIncomplete: payload.researchIncomplete,
      researchLowConfidence: payload.researchLowConfidence,
      contact: payload.contact,
      contactResearch: payload.contactResearch,
      company: payload.company,
      companyResearch: payload.companyResearch,
      product: payload.product,
      icp: payload.icp,
      persona: payload.persona,
      responseSchema: {
        dimensions: [
          {
            dimension: "string",
            component: "ICP|PERSONA|COMPANY|PRODUCT",
            assessment: "STRONG|MODERATE|WEAK|NO_FIT|UNKNOWN",
            evidence: ["string"],
            concerns: ["string"],
            confidence: "HIGH|MEDIUM|LOW",
          },
        ],
        fitStrengths: ["string"],
        fitRisks: ["string"],
        potentialDisqualifiers: [
          {
            criterion: "string matching an ICP negative signal",
            evidence: ["string"],
            confidence: "HIGH|MEDIUM|LOW",
          },
        ],
        recommendedAction: "string",
        reasoning: "string",
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

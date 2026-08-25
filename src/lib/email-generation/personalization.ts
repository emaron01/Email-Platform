/**
 * Graded email personalization. Research quality is a signal, not a binary
 * on/off. Thin or low-confidence research must degrade rather than be stretched
 * into false specificity.
 */

import type { EmailCompanyResearch } from "@/lib/email-generation/company-research-use";
import { contentTokens } from "@/lib/email-generation/company-research-use";

export const PERSONALIZATION_TIERS = ["BEST", "COMPANY", "THIN"] as const;
export type PersonalizationTier = (typeof PERSONALIZATION_TIERS)[number];

export type ContactResearchSlice = {
  roleSummary: string | null;
  responsibilities: string[];
  ownershipAreas: string[];
} | null;

export type PersonalizationDecision = {
  tier: PersonalizationTier;
  companyResearchUsable: boolean;
  contactResearchUsable: boolean;
  companyResearch: EmailCompanyResearch | null;
  contactResearch: ContactResearchSlice;
  label: string;
  detail: string;
};

export function hasSellingMotionSignals(
  research: EmailCompanyResearch,
): boolean {
  return (
    research.customerTypes.some((value) => value.trim()) ||
    research.primaryMarkets.some((value) => value.trim()) ||
    Boolean(research.businessModel?.trim()) ||
    Boolean(research.whatTheySell?.trim())
  );
}

export function isUsableCompanyResearch(
  research: EmailCompanyResearch | null,
): boolean {
  if (!research) return false;
  if (research.confidence !== "HIGH" && research.confidence !== "MEDIUM") {
    return false;
  }
  return hasSellingMotionSignals(research);
}

export function isUsableContactResearch(
  research: ContactResearchSlice,
): boolean {
  if (!research) return false;
  return Boolean(
    research.roleSummary?.trim() ||
      research.responsibilities.some((value) => value.trim()) ||
      research.ownershipAreas.some((value) => value.trim()),
  );
}

export function resolvePersonalization(input: {
  companyResearch: EmailCompanyResearch | null;
  contactResearch: ContactResearchSlice;
}): PersonalizationDecision {
  const companyResearchUsable = isUsableCompanyResearch(input.companyResearch);
  const contactResearchUsable = isUsableContactResearch(input.contactResearch);
  const companyResearch = companyResearchUsable ? input.companyResearch : null;
  const contactResearch = contactResearchUsable ? input.contactResearch : null;

  if (companyResearchUsable && contactResearchUsable) {
    return {
      tier: "BEST",
      companyResearchUsable,
      contactResearchUsable,
      companyResearch,
      contactResearch,
      label: "This person's role and their company",
      detail:
        "References this person's role and the company's selling motion. Review before sending.",
    };
  }
  if (companyResearchUsable) {
    return {
      tier: "COMPANY",
      companyResearchUsable,
      contactResearchUsable,
      companyResearch,
      contactResearch: null,
      label: "Company selling motion",
      detail:
        "Infers selling motion from company research. No usable contact research — add a personal touch if you know this person. Do not invent one.",
    };
  }
  return {
    tier: "THIN",
    companyResearchUsable: false,
    contactResearchUsable,
    companyResearch: null,
    contactResearch,
    label: "Persona and product only",
    detail: contactResearchUsable
      ? "No usable company research. Role notes are included where they exist. Do not invent a company situation."
      : "No usable company or contact research. A clean, honestly generic email is the right outcome — add your own specifics before sending, and do not invent them.",
  };
}

export const PERSONALIZATION_TIER_INSTRUCTIONS = `Personalization is graded. The user payload includes personalization.tier. Follow that tier. Do not upgrade it by inventing specifics.

BEST — usable contact research and usable company research:
- Infer selling motion from company research and connect it to the problem this product solves in THAT motion. Do not restate what the company does.
- Reference something specific from roleSummary, responsibilities, or ownershipAreas. Those are the only personal facts you may use.
- Do not invent a hook that is not in those fields.

COMPANY — usable company research, no usable contact research. This is the default quality bar:
- Infer selling motion from customerTypes, businessModel, whatTheySell, and primaryMarkets.
- Reason toward the problem this product solves in that motion.
- Title and company name identify the recipient. They are not research. Do not invent a personal hook.

THIN — little or no usable research:
- Write a clean persona-and-product email. Well written and honestly generic is required, not a failure.
- Do not invent company situation, selling motion, or personal details to fill the gap.
- A generic email that is true beats a specific email that is wrong.

Research quality:
- Only infer selling motion when personalization.companyResearchUsable is true.
- If company research is missing, thin (no selling-motion signals), or not HIGH/MEDIUM confidence, do not infer. Fall back to THIN behavior.
- Never stretch weak research into false specificity.
- Never use risk signals or any field not supplied in the payload.
- Never fabricate a personal hook when contact research is absent.`;

export function contactResearchForPrompt(
  research: {
    roleSummary: string | null;
    responsibilities: string[];
    ownershipAreas: string[];
  } | null,
): ContactResearchSlice {
  if (!research) return null;
  return {
    roleSummary: research.roleSummary,
    responsibilities: research.responsibilities,
    ownershipAreas: research.ownershipAreas,
  };
}

export function distinctiveContentTokens(
  text: string,
  exclude: string[] = [],
): Set<string> {
  const excluded = new Set(exclude.flatMap((value) => contentTokens(value)));
  return new Set(
    contentTokens(text).filter((token) => !excluded.has(token)),
  );
}

export function tokenJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function resolveEmailGenerationPersona(input: {
  overridePersonaId?: string | null;
  matchedPersonaId: string | null;
  campaignFallbackPersonaId: string | null;
}): {
  personaId: string | null;
  source: "override" | "matched" | "campaign_fallback";
  usedCampaignFallback: boolean;
} {
  if (input.overridePersonaId) {
    return {
      personaId: input.overridePersonaId,
      source: "override",
      usedCampaignFallback: false,
    };
  }
  if (input.matchedPersonaId) {
    return {
      personaId: input.matchedPersonaId,
      source: "matched",
      usedCampaignFallback: false,
    };
  }
  if (input.campaignFallbackPersonaId) {
    return {
      personaId: input.campaignFallbackPersonaId,
      source: "campaign_fallback",
      usedCampaignFallback: true,
    };
  }
  return {
    personaId: null,
    source: "campaign_fallback",
    usedCampaignFallback: true,
  };
}

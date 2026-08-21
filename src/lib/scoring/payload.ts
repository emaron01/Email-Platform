import type {
  IcpSnapshot,
  PersonaSnapshot,
  ProductSnapshot,
} from "@/lib/scoring/types";
import type { ApplicableDimension } from "@/lib/scoring/dimensions";

/** Sanitized contact fields for scoring — no email. */
export type ScoringContactInput = {
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company: string | null;
  industry: string | null;
  employeeCount: number | null;
  revenue: string | null;
  location: string | null;
};

export type ScoringCompanyResearchInput = {
  status: string | null;
  researchConfidence: string | null;
  companySummary: string | null;
  whatTheySell: string | null;
  customerTypes: string[];
  primaryMarkets: string[];
  businessModel: string | null;
  estimatedAov: string | null;
  aovReasoning: string | null;
  companySizeContext: string | null;
  relevantTechnologies: string[];
  buyingSignals: string[];
  riskSignals: string[];
  researchedAt: string | null;
} | null;

export type ScoringPayload = {
  contact: ScoringContactInput;
  company: {
    name: string | null;
    website: string | null;
    normalizedDomain: string | null;
    industry: string | null;
    employeeCount: number | null;
    revenue: string | null;
    location: string | null;
  } | null;
  companyResearch: ScoringCompanyResearchInput;
  researchIncomplete: boolean;
  researchLowConfidence: boolean;
  product: ProductSnapshot;
  icp: IcpSnapshot;
  persona: PersonaSnapshot;
  applicableDimensions: ApplicableDimension[];
};

export function buildScoringPayload(input: {
  contact: ScoringContactInput;
  company: ScoringPayload["company"];
  companyResearch: ScoringCompanyResearchInput;
  product: ProductSnapshot;
  icp: IcpSnapshot;
  persona: PersonaSnapshot;
  applicableDimensions: ApplicableDimension[];
}): ScoringPayload {
  const research = input.companyResearch;
  const researchIncomplete =
    !research ||
    research.status === "NOT_STARTED" ||
    research.status === "FAILED" ||
    research.status === "IN_PROGRESS" ||
    (!research.companySummary && !research.whatTheySell);

  const researchLowConfidence = research?.researchConfidence === "LOW";

  return {
    contact: input.contact,
    company: input.company,
    companyResearch: research,
    researchIncomplete,
    researchLowConfidence,
    product: input.product,
    icp: input.icp,
    persona: input.persona,
    applicableDimensions: input.applicableDimensions,
  };
}

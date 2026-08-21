/**
 * Future scoring-engine contract.
 * Phase 3A defines the shape only — no AI / research calls.
 */

import type { CriterionSnapshot } from "@/lib/criteria/types";

export const SCORE_LABELS = [
  "EXCELLENT",
  "GOOD",
  "FAIR",
  "POOR",
  "DISQUALIFIED",
] as const;

export type ScoreLabelValue = (typeof SCORE_LABELS)[number];

export const RESEARCH_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "NOT_REQUIRED",
] as const;

export type ResearchStatusValue = (typeof RESEARCH_STATUSES)[number];

export type ResearchSource = {
  title: string;
  url?: string;
  retrievedAt?: string;
  note?: string;
};

export type ContactScoringResult = {
  overallScore: number;
  icpScore: number;
  personaScore: number;
  companyScore: number;
  productRelevanceScore: number;

  scoreLabel: ScoreLabelValue;

  companySummary: string | null;
  whatTheySell: string | null;
  /** Textual range preferred, e.g. "$25K–$75K" — not false precision. */
  estimatedAov: string | null;
  aovReasoning: string | null;

  fitStrengths: string[];
  fitRisks: string[];
  disqualifiers: string[];

  reasoning: string;
  recommendedAction: string;

  researchSources: ResearchSource[];
};

export type ProductSnapshot = {
  id: string;
  name: string;
  description: string | null;
  valueProposition: string | null;
  averageOrderValue: string | null;
  websiteUrl: string | null;
};

export type IcpSnapshot = {
  id: string;
  name: string;
  description: string | null;
  definition: string | null;
  additionalContext?: string | null;
  interpretationVersion?: number;
  targetIndustries: string[] | null;
  minEmployees: number | null;
  maxEmployees: number | null;
  minRevenue: string | null;
  maxRevenue: string | null;
  targetGeographies: string[] | null;
  requiredTechnologies: string[] | null;
  positiveSignals: string[] | null;
  negativeSignals: string[] | null;
  notes: string | null;
  criteria: CriterionSnapshot[];
};

export type PersonaSnapshot = {
  id: string;
  name: string;
  definition: string | null;
  additionalContext?: string | null;
  interpretationVersion?: number;
  targetTitles: string[] | null;
  department: string | null;
  seniority: string | null;
  responsibilities: string | null;
  painPoints: string | null;
  desiredOutcomes: string | null;
  messagingNotes: string | null;
  criteria: CriterionSnapshot[];
};

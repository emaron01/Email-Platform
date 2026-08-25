/**
 * Deterministic scoring configuration (centralized — do not scatter magic numbers).
 */

/** Bumped when persona exclusion evidence rules entered the prompt. */
export const SCORING_PROMPT_VERSION = "4";
/** Bumped when PRIMARY/SECONDARY ICP qualification entered scoring. */
export const SCORING_LOGIC_VERSION = "6";

/** Concurrent AI scoring requests per ScoringRun. */
export const SCORING_CONCURRENCY = 3;

export const ASSESSMENT_VALUES = [
  "STRONG",
  "MODERATE",
  "WEAK",
  "NO_FIT",
  "UNKNOWN",
] as const;

export type AssessmentValue = (typeof ASSESSMENT_VALUES)[number];

/** Qualitative assessment → base numeric score. UNKNOWN is neutral, not "good". */
export const ASSESSMENT_SCORE_MAP: Record<AssessmentValue, number> = {
  STRONG: 100,
  MODERATE: 70,
  WEAK: 35,
  NO_FIT: 0,
  UNKNOWN: 50,
};

export const CONFIDENCE_VALUES = ["HIGH", "MEDIUM", "LOW"] as const;
export type ConfidenceValue = (typeof CONFIDENCE_VALUES)[number];

export const CONFIDENCE_MODIFIER: Record<ConfidenceValue, number> = {
  HIGH: 1.0,
  MEDIUM: 0.85,
  LOW: 0.7,
};

export const COMPONENT_WEIGHTS = {
  icp: 0.4,
  persona: 0.3,
  company: 0.15,
  productRelevance: 0.15,
} as const;

export type ScoreLabelThresholds = {
  excellentMin: number;
  goodMin: number;
  fairMin: number;
};

export const SCORE_LABEL_THRESHOLDS: ScoreLabelThresholds = {
  excellentMin: 90,
  goodMin: 75,
  fairMin: 60,
};

/** Minimum confidence required to accept an AI-proposed disqualifier. */
export const DISQUALIFIER_MIN_CONFIDENCE: ConfidenceValue = "MEDIUM";

export const SCORING_COMPONENTS = [
  "ICP",
  "PERSONA",
  "COMPANY",
  "PRODUCT",
] as const;

export type ScoringComponent = (typeof SCORING_COMPONENTS)[number];

export const ICP_DIMENSIONS = [
  "Industry Fit",
  "Employee Size Fit",
  "Revenue Fit",
  "Geography Fit",
  "Technology Fit",
  "Positive Buying Signals",
  "Negative / Disqualifying Signals",
] as const;

export const PERSONA_DIMENSIONS = [
  "Title Match",
  "Seniority Match",
  "Department / Function Match",
  "Responsibility Alignment",
  "Pain Point Relevance",
  "Desired Outcome Alignment",
] as const;

export const COMPANY_DIMENSIONS = [
  "What They Sell Alignment",
  "Customer Type Fit",
  "Business Model Fit",
  "Company Size Context",
  "Market Fit",
  "Relevant Technologies",
  "Buying Signals",
  "Risk Signals",
] as const;

export const PRODUCT_DIMENSIONS = [
  "Value Proposition Relevance",
  "Pain / Outcome Coverage",
] as const;

import { z } from "zod";
import {
  ASSESSMENT_VALUES,
  CONFIDENCE_VALUES,
  SCORING_COMPONENTS,
} from "@/lib/scoring/config";

export const dimensionAssessmentSchema = z.object({
  dimension: z.string().min(1),
  component: z.enum(SCORING_COMPONENTS),
  assessment: z.enum(ASSESSMENT_VALUES),
  evidence: z.array(z.string()),
  concerns: z.array(z.string()),
  confidence: z.enum(CONFIDENCE_VALUES),
});

export const potentialDisqualifierSchema = z.object({
  criterion: z.string().min(1),
  evidence: z.array(z.string()).min(1),
  confidence: z.enum(CONFIDENCE_VALUES),
});

export const aiScoringAssessmentSchema = z.object({
  dimensions: z.array(dimensionAssessmentSchema).min(1),
  fitStrengths: z.array(z.string()),
  fitRisks: z.array(z.string()),
  potentialDisqualifiers: z.array(potentialDisqualifierSchema),
  recommendedAction: z.string().min(1),
  reasoning: z.string().min(1),
});

export type DimensionAssessment = z.infer<typeof dimensionAssessmentSchema>;
export type PotentialDisqualifier = z.infer<typeof potentialDisqualifierSchema>;
export type AiScoringAssessment = z.infer<typeof aiScoringAssessmentSchema>;

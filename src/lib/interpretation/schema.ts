import { z } from "zod";
import { CRITERION_EVIDENCE_CLASSES } from "@/lib/criteria/evidence-class";
import {
  CRITERION_DATA_TYPES,
  CRITERION_IMPORTANCE,
  CRITERION_OPERATORS,
} from "@/lib/criteria/types";

export const interpretedCriterionSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  criterionType: z.string().min(1),
  dataType: z.enum(CRITERION_DATA_TYPES),
  operator: z.enum(CRITERION_OPERATORS),
  targetValue: z.unknown().optional(),
  minValue: z.unknown().optional(),
  maxValue: z.unknown().optional(),
  allowedValues: z.unknown().optional(),
  importance: z.enum(CRITERION_IMPORTANCE),
  isRequired: z.boolean(),
  isDisqualifier: z.boolean(),
  researchGuidance: z.string().nullable().optional(),
  /** AI proposal; app normalizes missing/unrecognized to TARGETED_SEARCH. */
  evidenceClass: z.enum(CRITERION_EVIDENCE_CLASSES).optional(),
  sortOrder: z.number().int().nonnegative(),
});

export const interpretationResultSchema = z.object({
  criteria: z.array(interpretedCriterionSchema).min(1),
});

export type InterpretationAiResult = z.infer<typeof interpretationResultSchema>;

export function parseInterpretedCriteria(raw: unknown): InterpretationAiResult {
  return interpretationResultSchema.parse(raw);
}

import { z } from "zod";

export const emailFactSelectionResultSchema = z.object({
  noneRelevant: z.boolean(),
  selected: z
    .array(
      z.object({
        candidateId: z.string().min(1),
        rationale: z.string().min(1).max(500),
      }),
    )
    .max(3),
});

export type EmailFactSelectionResult = z.infer<
  typeof emailFactSelectionResultSchema
>;

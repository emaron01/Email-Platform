import { z } from "zod";

export const offerValidationSchema = z.object({
  conflicts: z.array(
    z.object({
      code: z.enum(["CLAIM_CONFLICT", "TERM_CONFLICT", "EVIDENCE_CONFLICT"]),
      message: z.string().trim().min(1).max(500),
      offerExcerpt: z.string().trim().max(500).nullable(),
      evidenceExcerpt: z.string().trim().max(500).nullable(),
    }),
  ),
});

export type OfferValidationAiResult = z.infer<typeof offerValidationSchema>;

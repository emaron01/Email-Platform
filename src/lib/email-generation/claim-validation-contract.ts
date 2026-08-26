import { z } from "zod";

export const claimValidationSchema = z.object({
  compliant: z.boolean(),
  violations: z.array(
    z.object({
      type: z.enum([
        "PROHIBITED_CLAIM",
        "PROHIBITED_TERM",
        "INVENTED_OFFER_TERM",
        "UNSUPPORTED_FACT",
      ]),
      description: z.string().trim().min(1).max(500),
      matchedGuard: z.string().trim().max(500).nullable(),
      bodyExcerpt: z.string().trim().max(500).nullable(),
      origin: z.literal("MODEL_ORIGINATED").optional(),
    }),
  ),
});

export type ClaimValidationResult = z.infer<typeof claimValidationSchema>;
export type ClaimValidationViolation = z.infer<
  typeof claimValidationSchema
>["violations"][number];

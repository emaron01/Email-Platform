import { z } from "zod";

export const emailDraftGenerationSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10_000),
  reasoning: z.string().trim().min(1).max(4_000),
});

export type EmailDraftGeneration = z.infer<
  typeof emailDraftGenerationSchema
>;

import { z } from "zod";

export const PROSPECT_REPLY_MAX_CHARS = 10_000;

export const replyClassificationSchema = z.object({
  classification: z.enum([
    "INTERESTED",
    "OBJECTION",
    "REFERRAL",
    "NOT_NOW",
    "NOT_INTERESTED",
  ]),
  referralSuggested: z.boolean(),
  referralDetails: z.string().trim().max(1_000).nullable(),
  reasoning: z.string().trim().min(1).max(2_000),
});

import { z } from "zod";
import { researchSourceSchema } from "@/lib/research/assessment";

export const contactResearchAiResultSchema = z.object({
  roleSummary: z.string().nullable(),
  responsibilities: z.array(z.string()),
  ownershipAreas: z.array(z.string()),
  professionalSignals: z.array(z.string()),
  negativeRoleSignals: z.array(z.string()),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  sources: z.array(researchSourceSchema),
});

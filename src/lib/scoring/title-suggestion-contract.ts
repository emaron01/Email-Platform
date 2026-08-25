import { z } from "zod";

export const TITLE_SUGGESTION_CONFIDENCE = [
  "HIGH",
  "MEDIUM",
  "LOW",
  "NONE",
] as const;

export const titleSuggestionItemSchema = z.object({
  unmatchedTitle: z.string().min(1),
  /** Null when the title does not map to any persona. */
  proposedPersonaId: z.string().nullable(),
  confidence: z.enum(TITLE_SUGGESTION_CONFIDENCE),
  reasoning: z.string().min(1),
});

export const titleSuggestionAiResultSchema = z.object({
  suggestions: z.array(titleSuggestionItemSchema),
});

export type TitleSuggestionItem = z.infer<typeof titleSuggestionItemSchema>;
export type TitleSuggestionAiResult = z.infer<
  typeof titleSuggestionAiResultSchema
>;

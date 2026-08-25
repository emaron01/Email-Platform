import { z } from "zod";

export const productSourceDiscoverySchema = z.object({
  /** Hints only — authoritative URLs come from retrievedSources. */
  notes: z.string().nullable().optional(),
});

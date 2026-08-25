import type { AiProvider, AiStructuredResponse } from "@/lib/ai/types";
import {
  AiConfigError,
  AiProviderError,
  AiTimeoutError,
  AiValidationError,
} from "@/lib/ai";
import {
  aiScoringAssessmentSchema,
  type AiScoringAssessment,
} from "@/lib/scoring/assessment";
import type { ScoringPayload } from "@/lib/scoring/payload";
import { buildScoringMessages } from "@/lib/scoring/prompt";
import { TenantError } from "@/lib/tenant/getCurrentOrganization";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AiTimeoutError) return true;
  if (error instanceof AiProviderError) return error.retryable;
  return false;
}

export async function generateScoringAssessment(input: {
  provider: AiProvider;
  payload: ScoringPayload;
  maxRetries: number;
}): Promise<AiStructuredResponse<AiScoringAssessment>> {
  let attempt = 0;
  while (true) {
    try {
      return await input.provider.generateStructured({
        messages: buildScoringMessages(input.payload),
        schema: aiScoringAssessmentSchema,
        schemaName: "AiScoringAssessment",
      });
    } catch (error) {
      if (
        error instanceof AiValidationError ||
        error instanceof AiConfigError ||
        error instanceof TenantError
      ) {
        throw error;
      }
      if (!isRetryable(error) || attempt >= input.maxRetries) throw error;
      const delay = Math.min(2000 * 2 ** attempt, 8000);
      await sleep(delay);
      attempt += 1;
    }
  }
}

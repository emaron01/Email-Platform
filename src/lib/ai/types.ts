import type { z } from "zod";

export type AiMessageRole = "system" | "user" | "assistant";

export type AiMessage = {
  role: AiMessageRole;
  content: string;
};

export type AiStructuredRequest<T> = {
  messages: AiMessage[];
  schema: z.ZodType<T>;
  /** Optional schema name for adapters that support named JSON schemas. */
  schemaName?: string;
};

/** Adapter-normalized web/tool sources — never OpenAI-specific objects. */
export type NormalizedRetrievedSource = {
  url: string;
  title?: string | null;
  publisher?: string | null;
};

export type AiUsageMetadata = {
  inputTokens?: number;
  outputTokens?: number;
  webSearchCalls?: number;
};

export type AiStructuredResponse<T> = {
  data: T;
  rawText: string;
  provider: string;
  model: string;
  modelUrlIdentifier: string;
  /** Sources recovered from tools (e.g. Responses web_search). */
  retrievedSources?: NormalizedRetrievedSource[];
  usage?: AiUsageMetadata;
};

export interface AiProvider {
  generateStructured<T>(
    request: AiStructuredRequest<T>,
  ): Promise<AiStructuredResponse<T>>;
}

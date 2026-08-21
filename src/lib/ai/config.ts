/**
 * Centralized AI configuration — role-specific only.
 * Research and Scoring never share runtime env vars.
 * Do not scatter process.env.* outside this module.
 *
 * Legacy AI_PROVIDER / AI_MODEL / AI_MODEL_URL / AI_API_KEY are NOT used.
 * There is no silent fallback to those names.
 */

import { AiConfigError } from "@/lib/ai/errors";
import { sanitizeModelUrlIdentifier } from "@/lib/ai/redact";

/**
 * Scoring AI supports:
 * - openai-compatible: chat completions
 * - openai-responses: Responses API without web_search
 */
export type ScoringAiProviderKind = "openai-compatible" | "openai-responses";

/**
 * Research AI supports:
 * - openai-compatible: chat completions (no native web_search)
 * - openai-responses: Responses API + built-in web_search (production)
 */
export type ResearchAiProviderKind = "openai-compatible" | "openai-responses";

export type AiProviderKind = ScoringAiProviderKind | ResearchAiProviderKind;

export type AiRole =
  | "research"
  | "scoring"
  | "interpretation"
  | "contact_research";

export type AiConfig = {
  role: AiRole;
  provider: AiProviderKind;
  model: string;
  modelUrl: string;
  /** Sanitized URL identifier for provenance (no secrets). */
  modelUrlIdentifier: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
};

type RoleEnv = {
  provider: string;
  model: string;
  modelUrl: string;
  apiKey: string;
  timeoutMs: string;
  maxRetries: string;
  temperature: string;
};

const ROLE_ENV: Record<AiRole, RoleEnv> = {
  research: {
    provider: "RESEARCH_AI_PROVIDER",
    model: "RESEARCH_AI_MODEL",
    modelUrl: "RESEARCH_AI_MODEL_URL",
    apiKey: "RESEARCH_AI_API_KEY",
    timeoutMs: "RESEARCH_AI_TIMEOUT_MS",
    maxRetries: "RESEARCH_AI_MAX_RETRIES",
    temperature: "RESEARCH_AI_TEMPERATURE",
  },
  scoring: {
    provider: "SCORING_AI_PROVIDER",
    model: "SCORING_AI_MODEL",
    modelUrl: "SCORING_AI_MODEL_URL",
    apiKey: "SCORING_AI_API_KEY",
    timeoutMs: "SCORING_AI_TIMEOUT_MS",
    maxRetries: "SCORING_AI_MAX_RETRIES",
    temperature: "SCORING_AI_TEMPERATURE",
  },
  interpretation: {
    provider: "INTERPRETATION_AI_PROVIDER",
    model: "INTERPRETATION_AI_MODEL",
    modelUrl: "INTERPRETATION_AI_MODEL_URL",
    apiKey: "INTERPRETATION_AI_API_KEY",
    timeoutMs: "INTERPRETATION_AI_TIMEOUT_MS",
    maxRetries: "INTERPRETATION_AI_MAX_RETRIES",
    temperature: "INTERPRETATION_AI_TEMPERATURE",
  },
  contact_research: {
    provider: "CONTACT_RESEARCH_AI_PROVIDER",
    model: "CONTACT_RESEARCH_AI_MODEL",
    modelUrl: "CONTACT_RESEARCH_AI_MODEL_URL",
    apiKey: "CONTACT_RESEARCH_AI_API_KEY",
    timeoutMs: "CONTACT_RESEARCH_AI_TIMEOUT_MS",
    maxRetries: "CONTACT_RESEARCH_AI_MAX_RETRIES",
    temperature: "CONTACT_RESEARCH_AI_TEMPERATURE",
  },
};

function notConfiguredMessage(role: AiRole): string {
  switch (role) {
    case "research":
      return "Automated company research is not configured.";
    case "scoring":
      return "AI scoring is not configured.";
    case "interpretation":
      return "ICP and persona interpretation is not configured.";
    case "contact_research":
      return "Contact role research is not configured.";
  }
}

function readRequired(role: AiRole, name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AiConfigError(
      `${notConfiguredMessage(role)} Missing required environment variable: ${name}.`,
    );
  }
  return value;
}

function readOptionalNumber(
  role: AiRole,
  name: string,
  fallback: number,
  options?: { min?: number; max?: number },
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new AiConfigError(
      `${notConfiguredMessage(role)} Invalid numeric value for ${name}.`,
    );
  }
  if (options?.min != null && parsed < options.min) {
    throw new AiConfigError(
      `${notConfiguredMessage(role)} ${name} must be >= ${options.min}.`,
    );
  }
  if (options?.max != null && parsed > options.max) {
    throw new AiConfigError(
      `${notConfiguredMessage(role)} ${name} must be <= ${options.max}.`,
    );
  }
  return parsed;
}

function parseProvider(
  role: AiRole,
  raw: string,
  envName: string,
): AiProviderKind {
  if (raw === "openai-compatible") return "openai-compatible";
  if (raw === "openai-responses") {
    if (
      role === "research" ||
      role === "scoring" ||
      role === "interpretation" ||
      role === "contact_research"
    ) {
      return "openai-responses";
    }
  }
  throw new AiConfigError(
    `${notConfiguredMessage(role)} Unsupported ${envName} "${raw}". Supported: openai-compatible, openai-responses.`,
  );
}

function getAiConfigForRole(role: AiRole): AiConfig {
  const env = ROLE_ENV[role];
  const provider = parseProvider(
    role,
    readRequired(role, env.provider),
    env.provider,
  );
  const model = readRequired(role, env.model);
  const modelUrl = readRequired(role, env.modelUrl);
  const apiKey = readRequired(role, env.apiKey);

  return {
    role,
    provider,
    model,
    modelUrl,
    modelUrlIdentifier: sanitizeModelUrlIdentifier(modelUrl),
    apiKey,
    timeoutMs: readOptionalNumber(role, env.timeoutMs, 60_000, { min: 1_000 }),
    maxRetries: readOptionalNumber(role, env.maxRetries, 2, { min: 0, max: 10 }),
    temperature: readOptionalNumber(role, env.temperature, 0.2, {
      min: 0,
      max: 2,
    }),
  };
}

/** Fail closed for Research AI. Never reads Scoring AI vars. */
export function getResearchAiConfig(): AiConfig {
  return getAiConfigForRole("research");
}

/** Fail closed for Scoring AI. Never reads Research AI vars. */
export function getScoringAiConfig(): AiConfig {
  return getAiConfigForRole("scoring");
}

export function isResearchAiConfigured(): boolean {
  try {
    getResearchAiConfig();
    return true;
  } catch {
    return false;
  }
}

export function isScoringAiConfigured(): boolean {
  try {
    getScoringAiConfig();
    return true;
  } catch {
    return false;
  }
}

/** Fail closed for Interpretation AI. Never reads Research or Scoring vars. */
export function getInterpretationAiConfig(): AiConfig {
  return getAiConfigForRole("interpretation");
}

/** Fail closed for Contact Research AI. Never reads Research or Scoring vars. */
export function getContactResearchAiConfig(): AiConfig {
  return getAiConfigForRole("contact_research");
}

export function isInterpretationAiConfigured(): boolean {
  try {
    getInterpretationAiConfig();
    return true;
  } catch {
    return false;
  }
}

export function isContactResearchAiConfigured(): boolean {
  try {
    getContactResearchAiConfig();
    return true;
  } catch {
    return false;
  }
}

/** Safe summary for logs/UI — never includes API key. */
export function getAiConfigPublicSummary(config: AiConfig): {
  role: AiRole;
  provider: string;
  model: string;
  modelUrlIdentifier: string;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
} {
  return {
    role: config.role,
    provider: config.provider,
    model: config.model,
    modelUrlIdentifier: config.modelUrlIdentifier,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    temperature: config.temperature,
  };
}

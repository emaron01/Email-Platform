/**
 * Research AI prompt versioning (application constant — not env).
 * v2: OpenAI Responses + web_search production research prompt.
 */
export const RESEARCH_PROMPT_VERSION = "2";

/** Default when RESEARCH_CONCURRENCY is unset. Tuned for Starter web (512 MB). */
export const RESEARCH_CONCURRENCY_DEFAULT = 5;

const RESEARCH_CONCURRENCY_MAX = 50;

/**
 * Concurrent automated company research jobs per batch.
 * Override with RESEARCH_CONCURRENCY (1–50). Read at call time so ops can tune
 * without a code deploy (process restart still required on Render).
 */
export function getResearchConcurrency(): number {
  const raw = process.env.RESEARCH_CONCURRENCY?.trim();
  if (!raw) return RESEARCH_CONCURRENCY_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(
      `Invalid RESEARCH_CONCURRENCY "${raw}". Use an integer from 1 to ${RESEARCH_CONCURRENCY_MAX}.`,
    );
  }
  return Math.min(parsed, RESEARCH_CONCURRENCY_MAX);
}

/**
 * Production-safe structured research telemetry.
 * Never logs API keys, auth headers, or full page contents.
 */

export type ResearchTelemetryEvent = {
  event: "company_research_job";
  companyId: string;
  organizationId: string;
  provider: string;
  model: string;
  durationMs: number;
  webSearchCalls: number | null;
  sourceCount: number;
  status: "COMPLETED" | "PARTIAL" | "FAILED" | "SKIPPED";
  retries: number;
  errorCategory: string | null;
};

export function logResearchTelemetry(event: ResearchTelemetryEvent): void {
  // Structured single-line JSON for log aggregators.
  console.info(JSON.stringify(event));
}

export function categorizeResearchError(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  const name = (error as { name?: string }).name ?? "";
  const message = String((error as { message?: string }).message ?? "");
  if (name === "AiTimeoutError" || /timed out/i.test(message)) return "timeout";
  if (name === "AiValidationError") return "validation";
  if (name === "AiConfigError") return "config";
  if (/401|403|auth/i.test(message)) return "authentication";
  if (/429/.test(message)) return "rate_limit";
  if (/web search|tool/i.test(message)) return "web_search_unsupported";
  if (/5\d\d/.test(message)) return "server_error";
  return "provider_error";
}

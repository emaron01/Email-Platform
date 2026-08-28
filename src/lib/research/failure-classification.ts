/**
 * Client-safe research failure classification.
 * No server imports — safe for UI and shared types.
 */

import {
  classifyProductSynthesisError,
  type ProductSynthesisErrorCategory,
  type ProductSynthesisErrorInfo,
} from "@/lib/product-research/synthesis-errors";

export type ResearchFailureKind =
  /** Same company may succeed on retry (timeout, 5xx). */
  | "transient"
  /** Company-specific; retry unlikely to help (bad URL, validation). */
  | "permanent"
  /** Affects every remaining company — pause the batch (credit limit, auth). */
  | "provider_level";

export type ResearchFailureInfo = {
  kind: ResearchFailureKind;
  category: ProductSynthesisErrorCategory;
  userMessage: string;
  retryable: boolean;
  httpStatus?: number;
  providerCode?: string | null;
};

function messageHints(message: string): {
  insufficientQuota: boolean;
  billing: boolean;
} {
  const lower = message.toLowerCase();
  return {
    insufficientQuota:
      /insufficient.?quota|exceeded.*quota|quota.*exceeded/i.test(lower),
    billing:
      /billing|credit|payment|insufficient funds|out of credits/i.test(lower),
  };
}

export function resolveResearchFailureKind(
  classified: ProductSynthesisErrorInfo,
): ResearchFailureKind {
  const code = classified.providerCode?.toLowerCase() ?? "";
  const type = classified.providerType?.toLowerCase() ?? "";
  const hints = messageHints(classified.messageSafe);

  if (
    classified.category === "CONFIG" ||
    classified.category === "AUTH" ||
    code === "insufficient_quota" ||
    type === "insufficient_quota" ||
    hints.insufficientQuota ||
    hints.billing
  ) {
    return "provider_level";
  }

  if (classified.category === "RATE_LIMIT") {
    return "provider_level";
  }

  if (
    classified.category === "TIMEOUT" ||
    classified.category === "PROVIDER_5XX" ||
    classified.category === "NETWORK"
  ) {
    return "transient";
  }

  if (
    classified.category === "VALIDATION" ||
    classified.category === "STRUCTURED_OUTPUT" ||
    classified.category === "MODEL_NOT_FOUND" ||
    classified.category === "PROVIDER_4XX"
  ) {
    return "permanent";
  }

  return "transient";
}

export function researchFailureUserMessage(
  classified: ProductSynthesisErrorInfo,
  kind: ResearchFailureKind,
): string {
  const hints = messageHints(classified.messageSafe);
  const code = classified.providerCode?.toLowerCase() ?? "";

  if (
    code === "insufficient_quota" ||
    hints.insufficientQuota ||
    hints.billing
  ) {
    return "provider credit limit reached";
  }

  switch (classified.category) {
    case "RATE_LIMIT":
      return "provider rate limit reached";
    case "AUTH":
      return "provider authentication failed";
    case "CONFIG":
      return "research AI is not configured";
    case "TIMEOUT":
      return "research timed out";
    case "MODEL_NOT_FOUND":
      return "configured research model was not found";
    case "VALIDATION":
    case "STRUCTURED_OUTPUT":
      return "research output was invalid";
    case "PROVIDER_5XX":
      return "research provider is temporarily unavailable";
    case "NETWORK":
      return "network error contacting research provider";
    case "PROVIDER_4XX":
      return "research request was rejected by the provider";
    default:
      return kind === "provider_level"
        ? "research provider blocked further requests"
        : "research failed";
  }
}

export function classifyResearchFailure(
  error: unknown,
  stage = "companyResearch",
): ResearchFailureInfo {
  const classified = classifyProductSynthesisError(error, stage);
  const kind = resolveResearchFailureKind(classified);
  const userMessage = researchFailureUserMessage(classified, kind);

  return {
    kind,
    category: classified.category,
    userMessage,
    retryable: kind !== "permanent",
    httpStatus: classified.httpStatus,
    providerCode: classified.providerCode ?? null,
  };
}

export function isProviderLevelFailure(
  failure: Pick<ResearchFailureInfo, "kind"> | null | undefined,
): boolean {
  return failure?.kind === "provider_level";
}

export type ResearchRunFailureSummaryInput = {
  status: string;
  failedCount: number;
  completedCount: number;
  skippedFreshCount: number;
  quotaBlockedCount: number;
  lastError: string | null;
};

export function formatResearchRunFailureSummary(
  run: ResearchRunFailureSummaryInput,
): string | null {
  const hasFailures = run.failedCount > 0;
  const hasQuotaBlocked = run.quotaBlockedCount > 0;

  if (!hasFailures && !hasQuotaBlocked && run.status !== "FAILED") {
    return null;
  }

  if (run.status === "FAILED" && !hasFailures && run.lastError) {
    return run.lastError;
  }

  const parts: string[] = [];

  if (hasFailures) {
    const reason = run.lastError ? `: ${run.lastError}` : "";
    parts.push(
      `${run.failedCount} ${run.failedCount === 1 ? "company" : "companies"} failed${reason}`,
    );
  }

  if (hasQuotaBlocked) {
    parts.push(
      `${run.quotaBlockedCount} blocked by allowance limits`,
    );
  }

  if (run.completedCount > 0) {
    parts.push(`${run.completedCount} completed`);
  }

  if (run.skippedFreshCount > 0) {
    parts.push(`${run.skippedFreshCount} skipped (fresh)`);
  }

  return parts.join(" · ");
}

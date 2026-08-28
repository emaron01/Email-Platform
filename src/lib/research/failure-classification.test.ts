import { describe, expect, it } from "vitest";
import { AiProviderError, AiTimeoutError } from "@/lib/ai/errors";
import {
  classifyResearchFailure,
  formatResearchRunFailureSummary,
  resolveResearchFailureKind,
} from "@/lib/research/failure-classification";
import { classifyProductSynthesisError } from "@/lib/product-research/synthesis-errors";

describe("classifyResearchFailure", () => {
  it("classifies OpenAI insufficient quota as provider-level", () => {
    const failure = classifyResearchFailure(
      new AiProviderError(
        'Responses API request failed (429): {"error":{"code":"insufficient_quota","type":"insufficient_quota","message":"You exceeded your current quota"}}',
        {
          retryable: true,
          status: 429,
          providerCode: "insufficient_quota",
          providerType: "insufficient_quota",
        },
      ),
    );

    expect(failure.kind).toBe("provider_level");
    expect(failure.userMessage).toBe("provider credit limit reached");
    expect(failure.retryable).toBe(true);
  });

  it("classifies generic 429 as provider-level for batch pause", () => {
    const failure = classifyResearchFailure(
      new AiProviderError("rate limited", { retryable: true, status: 429 }),
    );

    expect(failure.kind).toBe("provider_level");
    expect(failure.userMessage).toBe("provider rate limit reached");
  });

  it("classifies timeouts as transient", () => {
    const failure = classifyResearchFailure(new AiTimeoutError());

    expect(failure.kind).toBe("transient");
    expect(failure.userMessage).toBe("research timed out");
  });

  it("classifies non-retryable 400 as permanent", () => {
    const failure = classifyResearchFailure(
      new AiProviderError("bad request", { retryable: false, status: 400 }),
    );

    expect(failure.kind).toBe("permanent");
    expect(failure.retryable).toBe(false);
  });
});

describe("resolveResearchFailureKind", () => {
  it("maps billing hints in message to provider-level", () => {
    const classified = classifyProductSynthesisError(
      new AiProviderError(
        "Your account has insufficient credits to complete this request",
        { status: 402 },
      ),
    );

    expect(resolveResearchFailureKind(classified)).toBe("provider_level");
  });
});

describe("formatResearchRunFailureSummary", () => {
  it("names failure count and provider reason", () => {
    expect(
      formatResearchRunFailureSummary({
        status: "PARTIAL",
        failedCount: 11,
        completedCount: 26,
        skippedFreshCount: 0,
        quotaBlockedCount: 0,
        lastError: "provider credit limit reached",
      }),
    ).toBe(
      "11 companies failed: provider credit limit reached · 26 completed",
    );
  });

  it("returns null when there are no failures", () => {
    expect(
      formatResearchRunFailureSummary({
        status: "COMPLETED",
        failedCount: 0,
        completedCount: 10,
        skippedFreshCount: 0,
        quotaBlockedCount: 0,
        lastError: null,
      }),
    ).toBeNull();
  });
});

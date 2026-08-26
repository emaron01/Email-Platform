import { describe, expect, it } from "vitest";
import {
  AiProviderError,
  AiValidationError,
} from "@/lib/ai/errors";
import {
  classifyEmailGenerationError,
  emailGenerationFailureUsageMetadata,
  toSafeEmailGenerationError,
} from "@/lib/email-generation/errors";

describe("email generation error observability", () => {
  it("names VALIDATION in the user-facing message with issue path", () => {
    const error = new AiValidationError("structured output failed validation.", {
      issues: [{ path: "reasoning", code: "too_small", expected: ">=1" }],
      usage: { inputTokens: 11, outputTokens: 7 },
      rawTextPreview: '{"subject":"Hi","body":"Hello"}',
    });
    expect(toSafeEmailGenerationError(error)).toBe(
      "[VALIDATION] Email draft failed validation (reasoning: too_small). Please try again.",
    );
  });

  it("records the same failure shape as product synthesis on UsageEvent metadata", () => {
    const error = new AiValidationError("structured output failed validation.", {
      issues: [{ path: "body", code: "invalid_type" }],
      usage: { inputTokens: 20, outputTokens: 3 },
      rawTextPreview: '{"subject":1}',
    });
    const classified = classifyEmailGenerationError(error);
    const meta = emailGenerationFailureUsageMetadata(error, classified);
    expect(meta).toMatchObject({
      errorType: "AiValidationError",
      errorCategory: "VALIDATION",
      stage: "validation",
      inputTokens: 20,
      outputTokens: 3,
      rawTextPreview: '{"subject":1}',
    });
    expect(meta.validationIssues).toEqual([
      { path: "body", code: "invalid_type" },
    ]);
  });

  it("classifies structured-output provider rejections distinctly", () => {
    const error = new AiProviderError(
      "Invalid text.format: Use response_format instead.",
      { status: 400, providerCode: "invalid_request_error" },
    );
    const classified = classifyEmailGenerationError(error);
    expect(classified.category).toBe("STRUCTURED_OUTPUT");
    expect(toSafeEmailGenerationError(error)).toMatch(/^\[STRUCTURED_OUTPUT\]/);
  });
});

/**
 * Product synthesis failure categories + safe structured logging.
 * Never logs API keys, prompts, or evidence content.
 */

import {
  AiConfigError,
  AiProviderError,
  AiTimeoutError,
  AiValidationError,
} from "@/lib/ai/errors";
import { redactSecrets } from "@/lib/ai/redact";
import { TenantError } from "@/lib/tenant/errors";
import { ZodError } from "zod";

export type ProductSynthesisErrorCategory =
  | "CONFIG"
  | "AUTH"
  | "MODEL_NOT_FOUND"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "PROVIDER_4XX"
  | "PROVIDER_5XX"
  | "STRUCTURED_OUTPUT"
  | "VALIDATION"
  | "NETWORK"
  | "UNKNOWN";

export type SafeValidationIssue = {
  path: string;
  code: string;
  expected?: string;
};

export type ProductSynthesisErrorInfo = {
  category: ProductSynthesisErrorCategory;
  httpStatus?: number;
  providerCode?: string | null;
  providerType?: string | null;
  stage: string;
  validationIssues?: SafeValidationIssue[];
  /** Safe short message for ops (already redacted). */
  messageSafe: string;
};

function parseProviderBodyHints(message: string): {
  code?: string;
  type?: string;
  structuredOutput?: boolean;
  modelNotFound?: boolean;
} {
  const lower = message.toLowerCase();
  let code: string | undefined;
  let type: string | undefined;
  try {
    const jsonStart = message.indexOf("{");
    if (jsonStart >= 0) {
      const parsed = JSON.parse(message.slice(jsonStart)) as {
        error?: { code?: string; type?: string; message?: string };
      };
      code = parsed.error?.code;
      type = parsed.error?.type;
    }
  } catch {
    // ignore — message may not contain JSON
  }

  const structuredOutput =
    /invalid_json_schema|json_schema|response_format|text\.format|structured output/i.test(
      message,
    ) || code === "invalid_json_schema";

  const modelNotFound =
    /model[_ ]?not[_ ]?found|does not exist|invalid model/i.test(lower) ||
    code === "model_not_found";

  return { code, type, structuredOutput, modelNotFound };
}

export function classifyProductSynthesisError(
  error: unknown,
  stage = "generateStructured",
): ProductSynthesisErrorInfo {
  if (error instanceof AiConfigError || error instanceof TenantError) {
    const msg = error.message;
    if (/not configured|missing|required/i.test(msg)) {
      return {
        category: "CONFIG",
        stage: "config",
        messageSafe: redactSecrets(msg).slice(0, 400),
      };
    }
  }

  if (error instanceof AiTimeoutError) {
    return {
      category: "TIMEOUT",
      stage,
      messageSafe: redactSecrets(error.message).slice(0, 400),
    };
  }

  if (error instanceof AiValidationError) {
    return {
      category: "VALIDATION",
      stage: "validation",
      validationIssues: error.issues,
      messageSafe: "Structured output failed schema validation.",
    };
  }

  if (error instanceof ZodError) {
    return {
      category: "VALIDATION",
      stage: "validation",
      validationIssues: error.issues.slice(0, 20).map((i) => ({
        path: i.path.join(".") || "(root)",
        code: i.code,
        expected:
          "expected" in i && i.expected != null
            ? String(i.expected).slice(0, 80)
            : undefined,
      })),
      messageSafe: "Structured output failed schema validation.",
    };
  }

  if (error instanceof AiProviderError) {
    const status = error.status;
    const hints = parseProviderBodyHints(error.message);
    const code = error.providerCode ?? hints.code ?? null;
    const type = error.providerType ?? hints.type ?? null;
    const messageSafe = redactSecrets(error.message).slice(0, 400);

    if (status === 401 || status === 403) {
      return {
        category: "AUTH",
        httpStatus: status,
        providerCode: code,
        providerType: type,
        stage,
        messageSafe,
      };
    }
    if (status === 404 || hints.modelNotFound) {
      return {
        category: "MODEL_NOT_FOUND",
        httpStatus: status,
        providerCode: code,
        providerType: type,
        stage,
        messageSafe,
      };
    }
    if (status === 429) {
      return {
        category: "RATE_LIMIT",
        httpStatus: status,
        providerCode: code,
        providerType: type,
        stage,
        messageSafe,
      };
    }
    if (hints.structuredOutput) {
      return {
        category: "STRUCTURED_OUTPUT",
        httpStatus: status,
        providerCode: code,
        providerType: type,
        stage,
        messageSafe,
      };
    }
    if (status != null && status >= 500) {
      return {
        category: "PROVIDER_5XX",
        httpStatus: status,
        providerCode: code,
        providerType: type,
        stage,
        messageSafe,
      };
    }
    if (status != null && status >= 400) {
      return {
        category: "PROVIDER_4XX",
        httpStatus: status,
        providerCode: code,
        providerType: type,
        stage,
        messageSafe,
      };
    }
    if (/network|fetch failed|econnrefused|enotfound|socket/i.test(error.message)) {
      return {
        category: "NETWORK",
        providerCode: code,
        providerType: type,
        stage,
        messageSafe,
      };
    }
    return {
      category: "UNKNOWN",
      httpStatus: status,
      providerCode: code,
      providerType: type,
      stage,
      messageSafe,
    };
  }

  if (error instanceof AiConfigError) {
    return {
      category: "CONFIG",
      stage: "config",
      messageSafe: redactSecrets(error.message).slice(0, 400),
    };
  }

  if (error instanceof Error) {
    if (/abort|timeout/i.test(error.message)) {
      return {
        category: "TIMEOUT",
        stage,
        messageSafe: redactSecrets(error.message).slice(0, 400),
      };
    }
    if (/fetch failed|econnrefused|enotfound|network/i.test(error.message)) {
      return {
        category: "NETWORK",
        stage,
        messageSafe: redactSecrets(error.message).slice(0, 400),
      };
    }
    return {
      category: "UNKNOWN",
      stage,
      messageSafe: redactSecrets(error.message).slice(0, 400),
    };
  }

  return {
    category: "UNKNOWN",
    stage,
    messageSafe: "Unknown product synthesis failure.",
  };
}

export type ProductSynthesisLogEvent = {
  event: "product_synthesis_error";
  organizationId: string;
  productId: string;
  setupRunId: string;
  evidenceBundleId: string;
  correlationId: string;
  provider: string | null;
  model: string | null;
  endpoint: string | null;
  stage: string;
  category: ProductSynthesisErrorCategory;
  httpStatus?: number;
  providerCode?: string | null;
  providerType?: string | null;
  validationIssues?: SafeValidationIssue[];
  durationMs: number;
  retryCount: number;
  messageSafe: string;
};

/**
 * Emit one structured console error for Render/log drains.
 * Never includes secrets, prompts, or evidence.
 */
export function logProductSynthesisFailure(
  event: ProductSynthesisLogEvent,
): void {
  // Scrub any accidental secret-looking substrings in messageSafe.
  const payload = {
    ...event,
    messageSafe: redactSecrets(event.messageSafe).slice(0, 400),
  };
  console.error("[product-synthesis]", JSON.stringify(payload));
}

export const USER_FACING_SYNTHESIS_FAILURE =
  "Product synthesis could not be completed. Acquired evidence was preserved. You can retry synthesis without re-researching sources.";

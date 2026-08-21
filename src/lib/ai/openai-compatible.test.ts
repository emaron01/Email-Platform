import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAiCompatibleProvider } from "@/lib/ai/providers/openai-compatible";
import { AiProviderError, AiValidationError } from "@/lib/ai/errors";
import { z } from "zod";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("openai-compatible adapter retries", () => {
  const config = {
    role: "scoring" as const,
    provider: "openai-compatible" as const,
    model: "env-model",
    modelUrl: "https://example.test/v1/chat/completions",
    modelUrlIdentifier: "https://example.test/v1/chat/completions",
    apiKey: "secret-key",
    timeoutMs: 5000,
    maxRetries: 2,
    temperature: 0.2,
  };

  const schema = z.object({ ok: z.boolean() });

  it("surfaces retryable provider errors for 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "rate limit" }), {
          status: 429,
        }),
      ),
    );

    const provider = createOpenAiCompatibleProvider(config);
    await expect(
      provider.generateStructured({
        messages: [{ role: "user", content: "hi" }],
        schema,
      }),
    ).rejects.toMatchObject({
      name: "AiProviderError",
      retryable: true,
      status: 429,
    } satisfies Partial<AiProviderError>);
  });

  it("does not mark validation failures as retryable provider errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ ok: "nope" }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const provider = createOpenAiCompatibleProvider(config);
    await expect(
      provider.generateStructured({
        messages: [{ role: "user", content: "hi" }],
        schema,
      }),
    ).rejects.toBeInstanceOf(AiValidationError);
  });

  it("uses model from config, not a hard-coded vendor model", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.model).toBe("env-model");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAiCompatibleProvider(config);
    const result = await provider.generateStructured({
      messages: [{ role: "user", content: "hi" }],
      schema,
    });
    expect(result.data.ok).toBe(true);
    expect(result.model).toBe("env-model");
    expect(JSON.stringify(result)).not.toContain("secret-key");
  });
});

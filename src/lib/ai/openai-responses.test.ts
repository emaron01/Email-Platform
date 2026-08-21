import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOpenAiResponsesProvider,
  parseResponsesPayload,
  resolveOpenAiResponsesUrl,
  responsesRequestEnablesWebSearch,
} from "@/lib/ai/providers/openai-responses";
import { AiProviderError, AiValidationError } from "@/lib/ai/errors";
import { z } from "zod";
import { getResearchAiConfig, getScoringAiConfig } from "@/lib/ai/config";
import { clearAiProviderCache, getScoringAiProvider } from "@/lib/ai/provider";
import { mergeEvidenceBundles } from "@/lib/research/evidence";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  clearAiProviderCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setResearchResponsesEnv(model = "research-responses-model") {
  process.env.RESEARCH_AI_PROVIDER = "openai-responses";
  process.env.RESEARCH_AI_MODEL = model;
  process.env.RESEARCH_AI_MODEL_URL = "https://api.example.test/v1";
  process.env.RESEARCH_AI_API_KEY = "research-responses-secret";
}

describe("openai-responses research adapter", () => {
  it("is selected only through Research environment config", () => {
    setResearchResponsesEnv();
    process.env.SCORING_AI_PROVIDER = "openai-compatible";
    process.env.SCORING_AI_MODEL = "scoring-model";
    process.env.SCORING_AI_MODEL_URL =
      "https://scoring.example.test/v1/chat/completions";
    process.env.SCORING_AI_API_KEY = "scoring-secret";

    const research = getResearchAiConfig();
    expect(research.provider).toBe("openai-responses");
    expect(research.model).toBe("research-responses-model");
    expect(research.role).toBe("research");
  });

  it("resolves Responses endpoint from configured model URL", () => {
    expect(resolveOpenAiResponsesUrl("https://api.openai.com/v1/responses")).toBe(
      "https://api.openai.com/v1/responses",
    );
    expect(resolveOpenAiResponsesUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/responses",
    );
    expect(
      resolveOpenAiResponsesUrl("https://api.openai.com/v1/chat/completions"),
    ).toBe("https://api.openai.com/v1/responses");
    expect(resolveOpenAiResponsesUrl("https://api.openai.com")).toBe(
      "https://api.openai.com/v1/responses",
    );
  });

  it("uses configured model rather than a hard-coded model", async () => {
    setResearchResponsesEnv("env-driven-model-xyz");
    const config = getResearchAiConfig();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.model).toBe("env-driven-model-xyz");
      expect(responsesRequestEnablesWebSearch(body)).toBe(true);
      expect(body.tools).toEqual([{ type: "web_search" }]);
      expect(body.include).toContain("web_search_call.action.sources");
      expect(body.store).toBe(false);
      return new Response(
        JSON.stringify({
          output: [
            {
              type: "web_search_call",
              action: {
                type: "search",
                query: "Acme Corp",
                sources: [{ url: "https://acme.example/", title: "Acme" }],
              },
            },
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    companySummary: "Acme sells widgets",
                    whatTheySell: "Widgets",
                    customerTypes: [],
                    primaryMarkets: [],
                    businessModel: null,
                    estimatedAov: null,
                    aovReasoning: "No public pricing found",
                    companySizeContext: null,
                    relevantTechnologies: [],
                    buyingSignals: [],
                    riskSignals: [],
                    confidence: "MEDIUM",
                    identityCertainty: "HIGH",
                    sources: [
                      {
                        url: "https://acme.example/",
                        title: "Acme",
                        publisher: null,
                        sourceType: "COMPANY_WEBSITE",
                        retrievedAt: new Date().toISOString(),
                        supports: ["companySummary", "whatTheySell"],
                      },
                    ],
                  }),
                  annotations: [
                    {
                      type: "url_citation",
                      url: "https://acme.example/",
                      title: "Acme",
                    },
                  ],
                },
              ],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAiResponsesProvider(config);
    const schema = z.object({
      companySummary: z.string().nullable(),
      whatTheySell: z.string().nullable(),
      customerTypes: z.array(z.string()),
      primaryMarkets: z.array(z.string()),
      businessModel: z.string().nullable(),
      estimatedAov: z.string().nullable(),
      aovReasoning: z.string().nullable(),
      companySizeContext: z.string().nullable(),
      relevantTechnologies: z.array(z.string()),
      buyingSignals: z.array(z.string()),
      riskSignals: z.array(z.string()),
      confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
      identityCertainty: z.enum(["HIGH", "MEDIUM", "LOW", "AMBIGUOUS"]),
      sources: z.array(z.any()),
    });

    const result = await provider.generateStructured({
      messages: [{ role: "user", content: "research" }],
      schema,
    });

    expect(result.model).toBe("env-driven-model-xyz");
    expect(result.retrievedSources?.[0]?.url).toBe("https://acme.example/");
    expect(result.usage?.webSearchCalls).toBe(1);
    expect(JSON.stringify(result)).not.toContain("research-responses-secret");
  });

  it("fails clearly when web search is rejected by the provider", async () => {
    setResearchResponsesEnv();
    const config = getResearchAiConfig();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "web_search not supported" } }), {
          status: 400,
        }),
      ),
    );

    const provider = createOpenAiResponsesProvider(config);
    await expect(
      provider.generateStructured({
        messages: [{ role: "user", content: "x" }],
        schema: z.object({ ok: z.boolean() }),
      }),
    ).rejects.toMatchObject({
      name: "AiProviderError",
      retryable: false,
    } satisfies Partial<AiProviderError>);
  });

  it("does not retry authentication failures as retryable", async () => {
    setResearchResponsesEnv();
    const config = getResearchAiConfig();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "invalid api key" }), {
          status: 401,
        }),
      ),
    );

    const provider = createOpenAiResponsesProvider(config);
    await expect(
      provider.generateStructured({
        messages: [{ role: "user", content: "x" }],
        schema: z.object({ ok: z.boolean() }),
      }),
    ).rejects.toMatchObject({
      retryable: false,
      status: 401,
    });
  });

  it("marks 429 as retryable", async () => {
    setResearchResponsesEnv();
    const config = getResearchAiConfig();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "rate limit" }), { status: 429 }),
      ),
    );

    const provider = createOpenAiResponsesProvider(config);
    await expect(
      provider.generateStructured({
        messages: [{ role: "user", content: "x" }],
        schema: z.object({ ok: z.boolean() }),
      }),
    ).rejects.toMatchObject({ retryable: true, status: 429 });
  });

  it("normalizes web_search results into plain source objects (no OpenAI types leak)", () => {
    const parsed = parseResponsesPayload({
      output: [
        {
          type: "web_search_call",
          action: {
            type: "search",
            sources: [{ url: "https://news.example/a", title: "News" }],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: '{"ok":true}',
              annotations: [
                {
                  type: "url_citation",
                  url: "https://acme.example/",
                  title: "Acme",
                },
              ],
            },
          ],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 2 },
    });

    expect(parsed.webSearchCalls).toBe(1);
    expect(parsed.retrievedSources.map((s) => s.url).sort()).toEqual([
      "https://acme.example/",
      "https://news.example/a",
    ]);
    // Plain objects only
    for (const source of parsed.retrievedSources) {
      expect(Object.keys(source).sort()).toEqual(
        expect.arrayContaining(["url", "title", "publisher"]),
      );
    }
  });

  it("rejects invalid structured JSON with AiValidationError", async () => {
    setResearchResponsesEnv();
    const config = getResearchAiConfig();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            output: [
              {
                type: "web_search_call",
                action: {
                  sources: [{ url: "https://acme.example/" }],
                },
              },
              {
                type: "message",
                content: [{ type: "output_text", text: '{"ok":"nope"}' }],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const provider = createOpenAiResponsesProvider(config);
    await expect(
      provider.generateStructured({
        messages: [{ role: "user", content: "x" }],
        schema: z.object({ ok: z.boolean() }),
      }),
    ).rejects.toBeInstanceOf(AiValidationError);
  });
});

describe("openai-responses scoring adapter", () => {
  function setScoringResponsesEnv(model = "scoring-luna-model") {
    process.env.SCORING_AI_PROVIDER = "openai-responses";
    process.env.SCORING_AI_MODEL = model;
    process.env.SCORING_AI_MODEL_URL = "https://api.openai.com/v1/responses";
    process.env.SCORING_AI_API_KEY = "scoring-responses-secret";
  }

  it("posts to /v1/responses without web_search tools", async () => {
    setScoringResponsesEnv("gpt-5.6-luna");
    const config = getScoringAiConfig();
    expect(config.provider).toBe("openai-responses");
    expect(config.modelUrl).toBe("https://api.openai.com/v1/responses");

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.openai.com/v1/responses");
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.model).toBe("gpt-5.6-luna");
      expect(responsesRequestEnablesWebSearch(body)).toBe(false);
      expect(body.tools).toBeUndefined();
      expect(body.tool_choice).toBeUndefined();
      expect(body.store).toBe(false);
      expect(body.text).toEqual({ format: { type: "json_object" } });
      return new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({ score: 42 }),
                },
              ],
            },
          ],
          usage: { input_tokens: 3, output_tokens: 4 },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = getScoringAiProvider();
    const result = await provider.generateStructured({
      messages: [{ role: "user", content: "score" }],
      schema: z.object({ score: z.number() }),
    });
    expect(result.data.score).toBe(42);
    expect(result.retrievedSources).toEqual([]);
    expect(result.usage?.webSearchCalls).toBe(0);
    expect(JSON.stringify(result)).not.toContain("scoring-responses-secret");
  });
});

describe("evidence merge", () => {
  it("merges website evidence with search evidence and removes duplicate URLs", () => {
    const merged = mergeEvidenceBundles(
      {
        sources: [
          {
            url: "https://acme.example/",
            title: "Home",
            publisher: null,
            sourceType: "COMPANY_WEBSITE",
            retrievedAt: "2026-01-01T00:00:00.000Z",
            supports: [],
          },
        ],
        excerpts: [
          {
            url: "https://acme.example/",
            title: "Home",
            text: "We sell widgets",
          },
        ],
      },
      {
        sources: [
          {
            url: "https://acme.example/",
            title: "Duplicate",
            publisher: null,
            sourceType: "OTHER",
            retrievedAt: "2026-01-02T00:00:00.000Z",
            supports: [],
          },
          {
            url: "https://news.example/story",
            title: "News",
            publisher: "News",
            sourceType: "NEWS",
            retrievedAt: "2026-01-02T00:00:00.000Z",
            supports: [],
          },
        ],
        excerpts: [],
      },
    );

    expect(merged.sources).toHaveLength(2);
    expect(merged.sources[0]?.title).toBe("Home");
    expect(merged.sources.map((s) => s.url)).toEqual([
      "https://acme.example/",
      "https://news.example/story",
    ]);
  });
});

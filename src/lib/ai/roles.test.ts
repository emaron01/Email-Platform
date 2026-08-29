import { afterEach, describe, expect, it } from "vitest";
import {
  assertScoringAiRolesConfigured,
  listAiRoleStatuses,
  listUnconfiguredScoringRoles,
  scoringAiReady,
} from "@/lib/ai/roles";
import { AiConfigError } from "@/lib/ai/errors";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

function clearAllAiEnv() {
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("RESEARCH_AI_") ||
      key.startsWith("SCORING_AI_") ||
      key.startsWith("INTERPRETATION_AI_") ||
      key.startsWith("CONTACT_RESEARCH_AI_") ||
      key.startsWith("PRODUCT_AI_") ||
      key.startsWith("PERSONA_AI_") ||
      key.startsWith("EMAIL_AI_")
    ) {
      delete process.env[key];
    }
  }
}

function setRole(prefix: string) {
  process.env[`${prefix}_PROVIDER`] = "openai-compatible";
  process.env[`${prefix}_MODEL`] = `${prefix}-model`;
  process.env[`${prefix}_MODEL_URL`] = `https://${prefix}.example.test/v1`;
  process.env[`${prefix}_API_KEY`] = `${prefix}-key`;
}

describe("AI role readiness", () => {
  it("lists every role and required env without secrets", () => {
    clearAllAiEnv();
    const statuses = listAiRoleStatuses();
    expect(statuses.map((row) => row.role)).toEqual([
      "research",
      "scoring",
      "contact_research",
      "interpretation",
      "product",
      "persona",
      "email",
      "email_facts",
    ]);
    expect(statuses.every((row) => !row.configured)).toBe(true);
    expect(
      JSON.stringify(statuses),
    ).not.toMatch(/-key/);
  });

  it("treats scoring as unready until scoring and contact research are both set", () => {
    clearAllAiEnv();
    setRole("SCORING_AI");
    expect(scoringAiReady()).toBe(false);
    expect(listUnconfiguredScoringRoles().map((row) => row.role)).toEqual([
      "contact_research",
    ]);
    setRole("CONTACT_RESEARCH_AI");
    expect(scoringAiReady()).toBe(true);
    expect(listUnconfiguredScoringRoles()).toEqual([]);
  });

  it("throws a loud config error naming the unset scoring roles", () => {
    clearAllAiEnv();
    setRole("SCORING_AI");
    expect(() => assertScoringAiRolesConfigured()).toThrow(AiConfigError);
    expect(() => assertScoringAiRolesConfigured()).toThrow(
      /CONTACT_RESEARCH_AI_PROVIDER/,
    );
  });
});

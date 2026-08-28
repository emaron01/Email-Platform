import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scoringRoot = path.resolve(process.cwd(), "src/lib/scoring");
const researchRoot = path.resolve(process.cwd(), "src/lib/research");
const emailGenerationRoot = path.resolve(
  process.cwd(),
  "src/lib/email-generation",
);

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("scoring/research/email business logic model hard-coding", () => {
  it("does not hard-code a vendor model id in scoring, research, or email generation business logic", () => {
    const files = [
      ...listTsFiles(scoringRoot),
      ...listTsFiles(researchRoot),
      ...listTsFiles(emailGenerationRoot),
    ];
    const banned = [
      /model:\s*["']gpt-/i,
      /["']gpt-4/i,
      /["']claude-/i,
      /["']gemini-/i,
      /api\.openai\.com/i,
      /anthropic\.com\/v1/i,
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const pattern of banned) {
        expect(source, `${file} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});

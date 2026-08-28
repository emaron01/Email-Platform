import { afterEach, describe, expect, it } from "vitest";
import {
  RESEARCH_CONCURRENCY_DEFAULT,
  getResearchConcurrency,
} from "@/lib/research/config";

describe("getResearchConcurrency", () => {
  const original = process.env.RESEARCH_CONCURRENCY;

  afterEach(() => {
    if (original === undefined) delete process.env.RESEARCH_CONCURRENCY;
    else process.env.RESEARCH_CONCURRENCY = original;
  });

  it("defaults to 5 when unset", () => {
    delete process.env.RESEARCH_CONCURRENCY;
    expect(getResearchConcurrency()).toBe(RESEARCH_CONCURRENCY_DEFAULT);
  });

  it("reads RESEARCH_CONCURRENCY from env", () => {
    process.env.RESEARCH_CONCURRENCY = "10";
    expect(getResearchConcurrency()).toBe(10);
  });

  it("caps at 50", () => {
    process.env.RESEARCH_CONCURRENCY = "100";
    expect(getResearchConcurrency()).toBe(50);
  });

  it("rejects invalid values", () => {
    process.env.RESEARCH_CONCURRENCY = "0";
    expect(() => getResearchConcurrency()).toThrow(/RESEARCH_CONCURRENCY/);
  });
});

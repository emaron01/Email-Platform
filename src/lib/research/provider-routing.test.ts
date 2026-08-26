import { describe, expect, it } from "vitest";
import {
  shouldSkipWebsiteOnlySynthesis,
  WEBSITE_FETCH_UNAVAILABLE_FOCUS,
} from "@/lib/research/provider-routing";
import { hasFirstPartyWebsiteEvidence } from "@/lib/research/sources";

describe("provider routing", () => {
  it("skips website-only synthesis when fetch is empty and search is available", () => {
    expect(
      shouldSkipWebsiteOnlySynthesis({
        hasFirstPartyEvidence: false,
        webSearchAvailable: true,
      }),
    ).toBe(true);
  });

  it("keeps website-only synthesis when first-party evidence exists", () => {
    expect(
      shouldSkipWebsiteOnlySynthesis({
        hasFirstPartyEvidence: true,
        webSearchAvailable: true,
      }),
    ).toBe(false);
  });

  it("does not skip when web search is unavailable", () => {
    expect(
      shouldSkipWebsiteOnlySynthesis({
        hasFirstPartyEvidence: false,
        webSearchAvailable: false,
      }),
    ).toBe(false);
  });

  it("detects empty excerpt bundles as unavailable first-party evidence", () => {
    expect(
      hasFirstPartyWebsiteEvidence({ sources: [], excerpts: [] }),
    ).toBe(false);
    expect(
      hasFirstPartyWebsiteEvidence({
        sources: [],
        excerpts: [{ url: "https://x.example", title: null, text: "   " }],
      }),
    ).toBe(false);
    expect(
      hasFirstPartyWebsiteEvidence({
        sources: [],
        excerpts: [
          { url: "https://x.example", title: null, text: "About Acme Corp" },
        ],
      }),
    ).toBe(true);
  });

  it("uses a search-focused message when the website fetch failed", () => {
    expect(WEBSITE_FETCH_UNAVAILABLE_FOCUS).toMatch(/web search/i);
    expect(WEBSITE_FETCH_UNAVAILABLE_FOCUS).toMatch(/blocked|empty|unavailable/i);
  });
});

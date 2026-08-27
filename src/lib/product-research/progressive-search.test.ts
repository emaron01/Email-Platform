/**
 * Product URL safety — progressive product web search was removed.
 * Company/persona research keep their own progressive search paths.
 */
import { describe, expect, it } from "vitest";
import { assertSafeExternalHttpUrl } from "@/lib/research/url-safety";
import { DEFAULT_RESEARCH_POLICY_VALUES } from "@/lib/usage/defaults";
import { readFileSync } from "node:fs";

describe("URL safety (SSRF)", () => {
  it("allows public https URLs", () => {
    expect(assertSafeExternalHttpUrl("https://example.com/product").ok).toBe(
      true,
    );
  });

  it("blocks localhost, private IPs, credentials, non-http", () => {
    expect(assertSafeExternalHttpUrl("http://localhost/x").ok).toBe(false);
    expect(assertSafeExternalHttpUrl("http://127.0.0.1/x").ok).toBe(false);
    expect(assertSafeExternalHttpUrl("http://10.0.0.5/x").ok).toBe(false);
    expect(assertSafeExternalHttpUrl("http://192.168.1.1/x").ok).toBe(false);
    expect(assertSafeExternalHttpUrl("http://169.254.169.254/").ok).toBe(false);
    expect(assertSafeExternalHttpUrl("file:///etc/passwd").ok).toBe(false);
    expect(
      assertSafeExternalHttpUrl("https://user:pass@example.com/x").ok,
    ).toBe(false);
  });
});

describe("product path does not web-search for customer products", () => {
  it("acquire no longer runs progressive product web search", () => {
    const acquire = readFileSync("src/lib/product-research/acquire.ts", "utf8");
    expect(acquire).not.toContain("runProgressiveProductWebSearch");
    expect(acquire).not.toContain("discoverSourcesViaWebSearch");
    expect(acquire).not.toContain("forceWebSearch");
    expect(acquire).not.toContain("maxSearchQueriesPerProduct");
    expect(acquire).toContain("does not web-search");
    expect(DEFAULT_RESEARCH_POLICY_VALUES.maxSourcesPerProduct).toBe(12);
  });

  it("workflow never discovers product sources via web search", () => {
    const workflow = readFileSync(
      "src/lib/product-research/workflow.ts",
      "utf8",
    );
    expect(workflow).not.toContain("discoverSourcesViaWebSearch");
    expect(workflow).not.toContain("runProgressiveProductWebSearch");
  });

  it("persona progressive search remains wired to shared discovery", () => {
    const persona = readFileSync(
      "src/lib/persona-research/progressive-search.ts",
      "utf8",
    );
    expect(persona).toContain("discoverSourcesViaWebSearch");
    expect(persona).toContain("maxSearchQueries");
  });
});

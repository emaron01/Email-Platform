import { describe, expect, it } from "vitest";
import {
  domainFromEmail,
  normalizeCompanyName,
  normalizeDomain,
  normalizeWebsiteUrl,
} from "@/lib/research/normalize";

describe("company normalization", () => {
  it("normalizes domains from urls and hosts", () => {
    expect(normalizeDomain("https://www.acme.com/")).toBe("acme.com");
    expect(normalizeDomain("www.acme.com")).toBe("acme.com");
    expect(normalizeDomain("acme.com")).toBe("acme.com");
    expect(normalizeDomain("HTTPS://Acme.COM/path?x=1")).toBe("acme.com");
  });

  it("normalizes website urls to https domain form", () => {
    expect(normalizeWebsiteUrl("www.acme.com")).toBe("https://acme.com");
    expect(normalizeWebsiteUrl("https://www.acme.com/about")).toBe(
      "https://acme.com",
    );
  });

  it("normalizes company names without aggressive fuzzy merging", () => {
    expect(normalizeCompanyName("Acme Corp.")).toBe("acme");
    expect(normalizeCompanyName("Acme, Inc")).toBe("acme");
    expect(normalizeCompanyName("Beta LLC")).toBe("beta");
    expect(normalizeCompanyName("Acme")).not.toBe(normalizeCompanyName("Acm"));
  });

  it("extracts domain from email", () => {
    expect(domainFromEmail("jane@acme.com")).toBe("acme.com");
    expect(domainFromEmail("bad")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  allocateExcerptBudget,
  htmlToTextSnippet,
  parseStubCanonicalUrl,
  sameRegistrableDomain,
  WEBSITE_EVIDENCE_TOTAL_CHAR_BUDGET,
} from "@/lib/research/sources";

describe("website evidence budget", () => {
  it("fills combined budget from products before homepage", () => {
    const excerpts = allocateExcerptBudget([
      {
        slot: "homepage",
        url: "https://acme.example/",
        title: "Home",
        text: "h".repeat(2000),
      },
      {
        slot: "products",
        url: "https://acme.example/products",
        title: "Products",
        text: "p".repeat(1200),
      },
      {
        slot: "about",
        url: "https://acme.example/about",
        title: "About",
        text: "a".repeat(1200),
      },
    ]);

    expect(excerpts.reduce((n, e) => n + e.text.length, 0)).toBe(
      WEBSITE_EVIDENCE_TOTAL_CHAR_BUDGET,
    );
    expect(excerpts[0]?.url).toContain("/products");
    expect(excerpts[1]?.url).toContain("/about");
    const homepage = excerpts.find((e) => e.url === "https://acme.example/");
    expect(homepage?.text.length).toBe(1600);
  });

  it("caps per-page text via htmlToTextSnippet", () => {
    expect(htmlToTextSnippet("x".repeat(5000), 1200).length).toBe(1200);
  });
});

describe("sameRegistrableDomain", () => {
  it("treats www and bare host as same", () => {
    expect(sameRegistrableDomain("www.acme.com", "acme.com")).toBe(true);
  });

  it("treats subdomains as same site", () => {
    expect(sameRegistrableDomain("blog.acme.com", "acme.com")).toBe(true);
  });

  it("treats different domains as different", () => {
    expect(sameRegistrableDomain("stoneeagle.com", "se-fi.com")).toBe(false);
  });
});

describe("parseStubCanonicalUrl", () => {
  it("follows one HTTPS link on a different registrable domain", () => {
    const html =
      '<html><body><a href="https://www.se-fi.com/">Return to StoneEagle</a></body></html>';
    expect(parseStubCanonicalUrl(html, "https://stoneeagle.com")).toBe(
      "https://www.se-fi.com/",
    );
  });

  it("rejects same-domain links", () => {
    const html =
      '<html><body><a href="https://stoneeagle.com/products">Products</a></body></html>';
    expect(parseStubCanonicalUrl(html, "https://stoneeagle.com")).toBeNull();
  });

  it("rejects non-HTTPS links", () => {
    const html =
      '<html><body><a href="http://www.se-fi.com/">Insecure</a></body></html>';
    expect(parseStubCanonicalUrl(html, "https://stoneeagle.com")).toBeNull();
  });

  it("rejects internal/private URLs blocked by url safety", () => {
    const html =
      '<html><body><a href="https://localhost/login">Local</a></body></html>';
    expect(parseStubCanonicalUrl(html, "https://stoneeagle.com")).toBeNull();
  });
});

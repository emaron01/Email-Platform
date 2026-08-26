import { describe, expect, it } from "vitest";
import { normalizeSuppressionEmail } from "@/lib/suppression/normalize";

describe("normalizeSuppressionEmail", () => {
  it("lowercases, trims, and strips plus-addressing", () => {
    expect(normalizeSuppressionEmail("  Alex+News@Acme.TEST ")).toBe(
      "alex@acme.test",
    );
    expect(normalizeSuppressionEmail("alex@acme.test")).toBe("alex@acme.test");
  });

  it("keeps dots in the local part", () => {
    expect(normalizeSuppressionEmail("john.smith@acme.test")).toBe(
      "john.smith@acme.test",
    );
  });

  it("returns null for empty or malformed values", () => {
    expect(normalizeSuppressionEmail(null)).toBeNull();
    expect(normalizeSuppressionEmail("")).toBeNull();
    expect(normalizeSuppressionEmail("not-an-email")).toBeNull();
  });
});

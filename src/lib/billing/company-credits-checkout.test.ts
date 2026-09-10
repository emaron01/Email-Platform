import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("company credit Checkout quantity + grant", () => {
  it("enables adjustable_quantity on credits Checkout (not default)", () => {
    const checkout = readFileSync(
      "src/lib/billing/create-company-credits-checkout.ts",
      "utf8",
    );
    expect(checkout).toContain("adjustable_quantity");
    expect(checkout).toContain("enabled: true");
    expect(checkout).toContain('mode: "payment"');
  });

  it("webhook payment mode grants from session line-item quantity", () => {
    const webhook = readFileSync(
      "src/lib/billing/handle-stripe-webhook.ts",
      "utf8",
    );
    const grant = readFileSync(
      "src/lib/billing/grant-credits-from-checkout.ts",
      "utf8",
    );
    expect(webhook).toContain('session.mode === "payment"');
    expect(webhook).toContain("grantCreditsFromCheckoutSession");
    expect(grant).toContain("listLineItems");
    expect(grant).toContain("companiesFromCreditCheckoutBlocks");
    expect(grant).toContain("grantCompanyResearchCredits");
  });

  it("idempotency uses checkout session id and payment intent id", () => {
    const grant = readFileSync(
      "src/lib/billing/company-research-credits.ts",
      "utf8",
    );
    expect(grant).toContain("stripeCheckoutSessionId");
    expect(grant).toContain("stripePaymentIntentId");
    expect(grant).toContain("P2002");
  });
});

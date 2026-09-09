import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

describe("middleware machine-auth allowlist", () => {
  it("does not redirect Stripe webhook or cadence digest without a session", async () => {
    for (const path of [
      "/api/billing/webhooks/stripe",
      "/api/jobs/cadence-digest",
    ]) {
      const request = new NextRequest(`https://www.example.com${path}`, {
        method: "POST",
      });
      const response = await middleware(request);
      expect(response.status).not.toBe(307);
      expect(response.status).not.toBe(302);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("still redirects other unauthenticated API routes to login", async () => {
    const request = new NextRequest(
      "https://www.example.com/api/billing/checkout",
      { method: "POST" },
    );
    const response = await middleware(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("next=");
  });

  it("webhook route verifies Stripe signature before handling", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/app/api/billing/webhooks/stripe/route.ts", "utf8"),
    );
    expect(src).toContain('request.headers.get("stripe-signature")');
    expect(src).toContain("webhooks.constructEvent");
    expect(src).toContain("Missing stripe-signature");
    expect(src).toContain("Invalid webhook signature");
  });
});

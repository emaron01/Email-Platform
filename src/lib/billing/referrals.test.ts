import { describe, expect, it } from "vitest";
import {
  REFERRAL_REWARD_COUPON_IDS,
  asReferralRewardPercent,
  referralRefereeCouponId,
  rewardPercentForCount,
} from "@/lib/billing/referral-coupons";
import { selfReferralBlockReason } from "@/lib/billing/referral-identity";

describe("referral coupons", () => {
  it("caps reward percent at 50 and steps by 10", () => {
    expect(rewardPercentForCount(0)).toBe(0);
    expect(rewardPercentForCount(1)).toBe(10);
    expect(rewardPercentForCount(5)).toBe(50);
    expect(rewardPercentForCount(9)).toBe(50);
    expect(asReferralRewardPercent(30)).toBe(30);
    expect(asReferralRewardPercent(15)).toBeNull();
    expect(referralRefereeCouponId()).toBe(REFERRAL_REWARD_COUPON_IDS[10]);
  });
});

describe("self-referral guards", () => {
  it("blocks same organization id", () => {
    expect(
      selfReferralBlockReason({
        referrer: {
          organizationId: "org_a",
          ownerEmailNormalized: "a@example.com",
          billingEmailNormalized: null,
        },
        referee: {
          organizationId: "org_a",
          ownerEmailNormalized: "a@example.com",
          billingEmailNormalized: null,
        },
      }),
    ).toContain("same organization");
  });

  it("blocks matching owner email across different orgs (re-signup)", () => {
    expect(
      selfReferralBlockReason({
        referrer: {
          organizationId: "org_old",
          ownerEmailNormalized: "rep@example.com",
          billingEmailNormalized: null,
        },
        referee: {
          organizationId: "org_new",
          ownerEmailNormalized: "rep@example.com",
          billingEmailNormalized: null,
        },
      }),
    ).toContain("matching account email");
  });

  it("blocks checkout email matching referrer billing email", () => {
    expect(
      selfReferralBlockReason({
        referrer: {
          organizationId: "org_a",
          ownerEmailNormalized: "owner@example.com",
          billingEmailNormalized: "bills@example.com",
        },
        referee: {
          organizationId: "org_b",
          ownerEmailNormalized: "other@example.com",
          billingEmailNormalized: null,
        },
        checkoutEmailNormalized: "bills@example.com",
      }),
    ).toContain("matching account email");
  });

  it("allows distinct orgs and emails", () => {
    expect(
      selfReferralBlockReason({
        referrer: {
          organizationId: "org_a",
          ownerEmailNormalized: "a@example.com",
          billingEmailNormalized: "a@example.com",
        },
        referee: {
          organizationId: "org_b",
          ownerEmailNormalized: "b@example.com",
          billingEmailNormalized: "b@example.com",
        },
        checkoutEmailNormalized: "b@example.com",
      }),
    ).toBeNull();
  });
});

describe("referral wiring contracts", () => {
  it("lazily creates codes via API and counts only on ACTIVE", async () => {
    const { readFileSync } = await import("node:fs");
    const route = readFileSync(
      "src/app/api/billing/referral-code/route.ts",
      "utf8",
    );
    const referrals = readFileSync("src/lib/billing/referrals.ts", "utf8");
    const webhook = readFileSync(
      "src/lib/billing/handle-stripe-webhook.ts",
      "utf8",
    );
    const billing = readFileSync(
      "src/app/(app)/settings/billing/page.tsx",
      "utf8",
    );
    expect(route).toContain("ensureOrganizationReferralCode");
    expect(referrals).toContain('billingStatus !== "ACTIVE"');
    expect(referrals).toContain("selfReferralBlockReason");
    expect(webhook).toContain("attributeReferralFromCheckoutSession");
    expect(webhook).toContain("countReferralIfActive");
    expect(billing).toContain("ReferralProgramPanel");
  });

  it("exposes copy code and editable copy message with no mailto", async () => {
    const { readFileSync } = await import("node:fs");
    const { referralShareMessage } = await import(
      "@/lib/billing/referral-share-message"
    );
    const panel = readFileSync(
      "src/components/billing/ReferralProgramPanel.tsx",
      "utf8",
    );
    const msg = referralShareMessage("AIMED10");
    expect(msg).toContain("Use code AIMED10 when you sign up");
    expect(msg).toContain("aimedoutreach.com");
    expect(msg).toContain("10% off for as long as you use it");
    expect(panel).toContain("Copy code");
    expect(panel).toContain("Copy message");
    expect(panel).toContain("billing-referral-copy-code");
    expect(panel).toContain("billing-referral-copy-message");
    expect(panel).toContain("billing-referral-message");
    expect(panel).toContain("referralShareMessage");
    expect(panel).not.toMatch(/mailto:/i);
  });
});

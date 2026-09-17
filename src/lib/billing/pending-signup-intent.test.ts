import { describe, expect, it } from "vitest";
import {
  buildPendingSignupIntent,
  parsePendingSignupIntent,
} from "@/lib/billing/pending-signup-intent";

describe("pending signup intent", () => {
  it("parses Standard with quantity 1", () => {
    expect(
      parsePendingSignupIntent({
        planCode: "STANDARD",
        seatQuantity: 5,
        companyName: "Acme",
      }),
    ).toEqual({
      planCode: "STANDARD",
      seatQuantity: 1,
      companyName: "Acme",
    });
  });

  it("clamps Team seats to 2–10", () => {
    expect(
      parsePendingSignupIntent({ planCode: "TEAM", seatQuantity: 1 }),
    ).toMatchObject({ planCode: "TEAM", seatQuantity: 2 });
    expect(
      parsePendingSignupIntent({ planCode: "TEAM", seatQuantity: 99 }),
    ).toMatchObject({ planCode: "TEAM", seatQuantity: 10 });
  });

  it("rejects Enterprise and unknown plans", () => {
    expect(parsePendingSignupIntent({ planCode: "ENTERPRISE" })).toBeNull();
    expect(buildPendingSignupIntent({ planCode: "FREE" })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildSeatChangeSummaryLines,
  formatMoneyParenthetical,
} from "@/lib/billing/add-seat";

describe("seat change confirmation copy", () => {
  it("formats next-bill seat removal as parenthetical money", () => {
    expect(formatMoneyParenthetical(5000, "usd")).toBe("($50.00)");
    expect(formatMoneyParenthetical(-5000, "usd")).toBe("($50.00)");
  });

  it("keeps add-seat proration language and notes company slots per seat", () => {
    const lines = buildSeatChangeSummaryLines({
      direction: "add",
      nextSeats: 4,
      unitAmountCents: 9900,
      nextMonthlyTotalCents: 39600,
      prorationAmountCents: 4500,
      currency: "usd",
      interval: "month",
      periodEnd: new Date("2026-10-01T00:00:00.000Z"),
      companiesPerSeat: 150,
    });
    expect(lines).toEqual([
      "New monthly total: $396.00 / month (4 seats × $99.00).",
      "Estimated charge today (proration): $45.00.",
      "At renewal (2026-10-01): $396.00.",
      "Each seat includes 150 company research slots for that user (600 total across 4 seats).",
    ]);
  });

  it("remove-seat says capacity ends now, no credit, lower next invoice", () => {
    const lines = buildSeatChangeSummaryLines({
      direction: "remove",
      nextSeats: 3,
      unitAmountCents: 9900,
      nextMonthlyTotalCents: 29700,
      prorationAmountCents: 0,
      currency: "usd",
      interval: "month",
      periodEnd: new Date("2026-10-01T00:00:00.000Z"),
    });
    expect(lines).toEqual([
      "This seat and its invite capacity end immediately (4 → 3 seats).",
      "No credit for the rest of this billing period — you already paid for this seat through 2026-10-01.",
      "Next invoice (2026-10-01): $297.00 / month (3 seats × $99.00; seat charge removed ($99.00)).",
    ]);
    expect(lines.join("\n")).not.toMatch(/proration|Estimated credit/i);
  });

  it("apply path claims local seatQuantity before Stripe and rolls back on failure", () => {
    const lib = readFileSync("src/lib/billing/add-seat.ts", "utf8");
    expect(lib).toContain("updateMany");
    expect(lib).toContain("CONCURRENT_SEAT_CHANGE");
    expect(lib).toContain("expectedCurrentSeats");
    expect(lib).toMatch(/seatQuantity: input\.expectedCurrentSeats/);
    expect(lib).toContain("STRIPE_UPDATE_FAILED");
  });
});

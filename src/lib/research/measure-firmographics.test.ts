import { describe, expect, it } from "vitest";
import {
  compareFirmographics,
  hasEmployeeCountSignal,
  hasRevenueSignal,
} from "@/lib/research/measure-firmographics";

describe("firmographics detection", () => {
  it("detects LinkedIn employee range in companySizeContext", () => {
    expect(
      hasEmployeeCountSignal({
        companySizeContext:
          "LinkedIn lists Motorcity Systems as privately held with 11–50 employees.",
      }),
    ).toBe(true);
  });

  it("does not treat negated employee mentions as a signal", () => {
    expect(
      hasEmployeeCountSignal({
        companySizeContext:
          "Reach metrics only; not employee-count or revenue disclosures.",
      }),
    ).toBe(false);
  });

  it("detects estimatedAov as revenue signal", () => {
    expect(
      hasRevenueSignal({
        estimatedAov: "$25K–$75K",
      }),
    ).toBe(true);
  });

  it("flags qualification regression when employee signal is lost", () => {
    const result = compareFirmographics(
      {
        companySizeContext: "LinkedIn shows 51–200 employees.",
      },
      {
        companySizeContext: "Founded in 1998; no employee count in evidence.",
      },
    );
    expect(result.lostEmployeeCountSignal).toBe(true);
    expect(result.qualificationRegression).toBe(true);
  });
});

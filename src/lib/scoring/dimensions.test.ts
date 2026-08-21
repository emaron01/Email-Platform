import { describe, expect, it } from "vitest";
import { getApplicableDimensions } from "@/lib/scoring/dimensions";
import type {
  IcpSnapshot,
  PersonaSnapshot,
  ProductSnapshot,
} from "@/lib/scoring/types";

describe("applicable dimensions", () => {
  it("does not penalize blank ICP criteria (omits those dimensions)", () => {
    const icp: IcpSnapshot = {
      id: "1",
      name: "Sparse ICP",
      description: null,
      definition: null,
      targetIndustries: ["Healthcare"],
      minEmployees: null,
      maxEmployees: null,
      minRevenue: null,
      maxRevenue: null,
      targetGeographies: null,
      requiredTechnologies: null,
      positiveSignals: null,
      negativeSignals: null,
      notes: null,
      criteria: [],
    };
    const persona: PersonaSnapshot = {
      id: "p1",
      name: "Buyer",
      definition: null,
      targetTitles: ["VP Sales"],
      department: null,
      seniority: null,
      responsibilities: null,
      painPoints: null,
      desiredOutcomes: null,
      messagingNotes: null,
      criteria: [],
    };
    const product: ProductSnapshot = {
      id: "pr1",
      name: "Product",
      description: "Desc",
      valueProposition: "Value",
      averageOrderValue: null,
      websiteUrl: null,
    };

    const dims = getApplicableDimensions({ icp, persona, product });
    const names = dims.filter((d) => d.component === "ICP").map((d) => d.dimension);

    expect(names).toContain("Industry Fit");
    expect(names).not.toContain("Employee Size Fit");
    expect(names).not.toContain("Revenue Fit");
    expect(names).not.toContain("Geography Fit");
    expect(names).not.toContain("Technology Fit");
  });
});

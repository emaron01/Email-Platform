import { describe, expect, it } from "vitest";
import {
  buildHomeSetupLine,
  formatProductSetupClause,
} from "@/lib/workflow/home-setup-line";
import { getProductCampaignReadiness } from "@/lib/workflow/product-campaign-readiness";

describe("home setup line", () => {
  it("names each product that still needs work", () => {
    const line = buildHomeSetupLine({
      products: [
        {
          name: "OT NOM",
          readiness: getProductCampaignReadiness({
            approvalStatus: "APPROVED",
            icps: [{ criteria: [{}] }],
            personas: [{}],
          }),
        },
        {
          name: "Mathew Sales Forecaster",
          readiness: getProductCampaignReadiness({
            approvalStatus: "APPROVED",
            icps: [],
            personas: [{}],
          }),
        },
      ],
      totalIcps: 1,
      totalPersonas: 5,
    });
    expect(line.text).toBe(
      "OT NOM ready · Mathew Sales Forecaster needs an ICP",
    );
    expect(line.href).toBe("/products");
  });

  it("summarizes counts when every product is campaign-ready", () => {
    const ready = getProductCampaignReadiness({
      approvalStatus: "APPROVED",
      icps: [{ criteria: [{}] }],
      personas: [{}],
    });
    const line = buildHomeSetupLine({
      products: [
        { name: "OT NOM", readiness: ready },
        { name: "Mathew Sales Forecaster", readiness: ready },
      ],
      totalIcps: 2,
      totalPersonas: 8,
    });
    expect(line.text).toBe("Setup complete · 2 products · 2 ICPs · 8 personas");
  });

  it("maps persona blocker to readable clause", () => {
    expect(
      formatProductSetupClause(
        "Acme",
        getProductCampaignReadiness({
          approvalStatus: "APPROVED",
          icps: [{ criteria: [{}] }],
          personas: [],
        }),
      ),
    ).toBe("Acme needs a persona");
  });
});

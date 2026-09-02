import { describe, expect, it } from "vitest";
import {
  discoverAppRoutePatterns,
  expandRoutePattern,
} from "@/test/smoke/discover-routes";

describe("smoke route discovery", () => {
  const ids = {
    organizationId: "org_1",
    productId: "prod_1",
    icpId: "icp_1",
    personaId: "persona_1",
    campaignId: "camp_1",
    listId: "list_1",
    companyId: "company_1",
    scoringRunId: "score_1",
    productSetupRunId: "psrun_1",
    productResynthesisRunId: "pres_1",
    personaSetupRunId: "perun_1",
    personaResynthesisRunId: "prreb_1",
  };

  it("discovers every app page route from the filesystem", () => {
    const patterns = discoverAppRoutePatterns();
    expect(patterns).toContain("/icps/new");
    expect(patterns).toContain("/personas/new");
    expect(patterns).toContain("/setup/[productId]/research/resynthesis/[runId]");
    expect(patterns.length).toBeGreaterThanOrEqual(50);
  });

  it("expands campaign stage and dynamic ids", () => {
    const stages = expandRoutePattern("/campaigns/[id]/[stage]", ids);
    expect(stages).toHaveLength(6);
    expect(stages[0]).toBe("/campaigns/camp_1/setup");
  });
});

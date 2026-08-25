/**
 * createScoringRunAction redirect + UI seam tests.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("createScoringRunAction redirect", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("propagates Next redirect throw on success (not converted to result)", async () => {
    const redirect = vi.fn((url: string) => {
      const err = new Error(`NEXT_REDIRECT:${url}`);
      (err as Error & { digest?: string }).digest = "NEXT_REDIRECT";
      throw err;
    });
    const createScoringRun = vi.fn(async () => ({ id: "run_abc" }));

    vi.doMock("next/navigation", () => ({ redirect }));
    vi.doMock("@/lib/tenant/data", () => ({ createScoringRun }));
    vi.doMock("@/lib/interpretation/icp", () => ({
      listIcpCriteria: vi.fn(async () => []),
    }));
    vi.doMock("@/lib/tenant/getCurrentOrganization", async () => ({
      ...(await vi.importActual("@/lib/tenant/getCurrentOrganization")),
      requireOrganizationId: vi.fn(async () => "org_1"),
    }));

    const { createScoringRunAction } = await import("@/app/actions/scoring");
    const formData = new FormData();
    formData.set("contactListId", "list_1");
    formData.set("productId", "prod_1");
    formData.set("icpId", "icp_1");
    formData.set("personaId", "persona_1");

    await expect(createScoringRunAction(null, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/scoring/run_abc",
    );
    expect(createScoringRun).toHaveBeenCalledTimes(1);
    expect(createScoringRun).toHaveBeenCalledWith(
      expect.objectContaining({ personaId: "persona_1" }),
    );
    expect(redirect).toHaveBeenCalledWith("/scoring/run_abc");
  });

  it("creates an all-personas run when the sentinel is submitted", async () => {
    const redirect = vi.fn((url: string) => {
      const err = new Error(`NEXT_REDIRECT:${url}`);
      (err as Error & { digest?: string }).digest = "NEXT_REDIRECT";
      throw err;
    });
    const createScoringRun = vi.fn(async () => ({ id: "run_all" }));

    vi.doMock("next/navigation", () => ({ redirect }));
    vi.doMock("@/lib/tenant/data", () => ({ createScoringRun }));
    vi.doMock("@/lib/interpretation/icp", () => ({
      listIcpCriteria: vi.fn(async () => []),
    }));
    vi.doMock("@/lib/tenant/getCurrentOrganization", async () => ({
      ...(await vi.importActual("@/lib/tenant/getCurrentOrganization")),
      requireOrganizationId: vi.fn(async () => "org_1"),
    }));

    const { createScoringRunAction } = await import("@/app/actions/scoring");
    const { ALL_PERSONAS_VALUE } = await import("@/lib/scoring/title-fit");
    const formData = new FormData();
    formData.set("contactListId", "list_1");
    formData.set("productId", "prod_1");
    formData.set("icpId", "icp_1");
    formData.set("personaId", ALL_PERSONAS_VALUE);

    await expect(createScoringRunAction(null, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/scoring/run_all",
    );
    expect(createScoringRun).toHaveBeenCalledWith(
      expect.objectContaining({ personaId: null }),
    );
  });

  it("returns a result object when createScoringRun fails (no redirect)", async () => {
    const redirect = vi.fn();
    const createScoringRun = vi.fn(async () => {
      throw new Error("db down");
    });

    vi.doMock("next/navigation", () => ({ redirect }));
    vi.doMock("@/lib/tenant/data", () => ({ createScoringRun }));
    vi.doMock("@/lib/interpretation/icp", () => ({
      listIcpCriteria: vi.fn(async () => []),
    }));
    vi.doMock("@/lib/tenant/getCurrentOrganization", async () => ({
      ...(await vi.importActual("@/lib/tenant/getCurrentOrganization")),
      requireOrganizationId: vi.fn(async () => "org_1"),
    }));

    const { createScoringRunAction } = await import("@/app/actions/scoring");
    const formData = new FormData();
    formData.set("contactListId", "list_1");
    formData.set("productId", "prod_1");
    formData.set("icpId", "icp_1");
    formData.set("personaId", "persona_1");

    const result = await createScoringRunAction(null, formData);
    expect(result).toEqual({
      ok: false,
      message: "Unable to create scoring run. Please try again.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("scoring run UI seam", () => {
  it("ScoreListForm renders validation errors from action state", () => {
    const formSrc = readFileSync("src/components/ScoreListForm.tsx", "utf8");
    expect(formSrc).toContain("useActionState");
    expect(formSrc).toContain("createScoringRunAction");
    expect(formSrc).toContain('data-testid="scoring-run-status"');
    expect(formSrc).toContain("All personas");
    expect(formSrc).toContain("ALL_PERSONAS_VALUE");
    expect(formSrc).toContain("state.message");
  });

  it("score report hosts unmatched-title review", () => {
    const pageSrc = readFileSync(
      "src/app/(app)/scoring/[runId]/page.tsx",
      "utf8",
    );
    const reviewSrc = readFileSync(
      "src/components/TitleSuggestionReview.tsx",
      "utf8",
    );
    expect(pageSrc).toContain("TitleSuggestionReview");
    expect(pageSrc).toContain("Unmatched titles");
    expect(reviewSrc).toContain("resolveTitleSuggestionAction");
    expect(reviewSrc).toContain("Approve");
    expect(reviewSrc).toContain("Dismiss");
    expect(reviewSrc).toContain("Assign");
  });
});

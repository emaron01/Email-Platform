import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/ScoreReportClient.tsx", "utf8");

describe("ScoreReportClient table layout", () => {
  it("uses a fixed-width table with sticky score headers", () => {
    expect(source).toContain("table-fixed");
    expect(source).toContain("sticky top-0");
    expect(source).toContain("<colgroup>");
    expect(source).toContain("tabular-nums");
  });

  it("shows how many ICP criteria contributed to the score", () => {
    expect(source).toContain("componentCoverage");
    expect(source).toContain("of {coverage.total} criteria");
    expect(source).toContain('return "Maybe"');
  });

  it("caps recommendations at two lines and keeps the full text available", () => {
    expect(source).toContain("line-clamp-2 max-h-10");
    expect(source).toContain('title={row.recommendedAction ?? "Pending"}');
    expect(source).toContain('label="Recommended Action"');
  });

  it("explains which primaries passed, which are unresolved, and which secondary signals were found", () => {
    expect(source).toContain('data-testid="icp-qualification-why"');
    expect(source).toContain("Why this ICP result");
    expect(source).toContain("Primary passed:");
    expect(source).toContain("Primary unresolved:");
    expect(source).toContain("Secondary signals found:");
    expect(source).toContain("readIcpQualification");
  });
});

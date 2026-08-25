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

  it("caps recommendations at two lines and keeps the full text available", () => {
    expect(source).toContain("line-clamp-2 max-h-10");
    expect(source).toContain('title={row.recommendedAction ?? "Pending"}');
    expect(source).toContain('label="Recommended Action"');
  });
});

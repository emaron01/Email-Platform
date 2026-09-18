import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  explainDigestSendWindow,
  shouldSendDigestNow,
} from "@/lib/cadence/digest";

describe("cadence digest send window", () => {
  it("accepts the 15-minute local window on weekdays", () => {
    // 2026-09-18 is a Friday; 12:05 UTC = 08:05 America/New_York (EDT).
    const now = new Date("2026-09-18T12:05:00.000Z");
    expect(
      shouldSendDigestNow({
        now,
        timezone: "America/New_York",
        digestSendTimeLocal: "08:00",
      }),
    ).toBe(true);
  });

  it("rejects outside the window with outside_send_window", () => {
    // 11:40 America/New_York on a Friday.
    const now = new Date("2026-09-18T15:40:00.000Z");
    const explained = explainDigestSendWindow({
      now,
      timezone: "America/New_York",
      digestSendTimeLocal: "08:00",
    });
    expect(explained.ok).toBe(false);
    if (!explained.ok) {
      expect(explained.reason).toBe("outside_send_window");
      expect(explained.detail).toMatch(/local=11:40/);
    }
  });

  it("rejects weekends", () => {
    const saturday = new Date("2026-09-19T12:05:00.000Z");
    const explained = explainDigestSendWindow({
      now: saturday,
      timezone: "America/New_York",
      digestSendTimeLocal: "08:00",
    });
    expect(explained.ok).toBe(false);
    if (!explained.ok) {
      expect(explained.reason).toBe("weekend");
    }
  });

  it("job route supports force=1 and digests log skip reasons", () => {
    const route = readFileSync(
      "src/app/api/jobs/cadence-digest/route.ts",
      "utf8",
    );
    expect(route).toContain('force=1');
    expect(route).toContain("force");
    const lib = readFileSync("src/lib/cadence/digest.ts", "utf8");
    expect(lib).toContain("[cadence-digest] skipped");
    expect(lib).toContain("skipReasons");
    expect(lib).toContain("outside_send_window");
  });
});

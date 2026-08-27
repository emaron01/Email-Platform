import { describe, expect, it } from "vitest";
import {
  addDays,
  computeNextDueAt,
  gapDaysAfterSentCount,
  isAtMaxSequence,
  isDue,
  isMeetingSchedulingReply,
  cadenceUrgency,
} from "@/lib/cadence/engine";
import {
  cumulativeDisplayToPolicyGaps,
  policyToCumulativeDisplay,
  validateCumulativeCadenceInput,
} from "@/lib/cadence/display";
import { DEFAULT_CADENCE_POLICY } from "@/lib/cadence/defaults";

describe("cadence engine", () => {
  const policy = { ...DEFAULT_CADENCE_POLICY };

  it("maps sent count to gap days", () => {
    expect(gapDaysAfterSentCount(1, policy)).toBe(9);
    expect(gapDaysAfterSentCount(2, policy)).toBe(6);
    expect(gapDaysAfterSentCount(3, policy)).toBe(15);
    expect(gapDaysAfterSentCount(4, policy)).toBe(30);
    expect(gapDaysAfterSentCount(5, policy)).toBe(30);
  });

  it("computes next due from latest sent email", () => {
    const sentAt = new Date("2026-01-01T12:00:00.000Z");
    const next = computeNextDueAt({ latestSentAt: sentAt, sentCount: 1, policy });
    expect(next).toEqual(addDays(sentAt, 9));
  });

  it("returns null when max sequence reached (default 4)", () => {
    const sentAt = new Date("2026-01-01T12:00:00.000Z");
    expect(
      computeNextDueAt({ latestSentAt: sentAt, sentCount: 4, policy }),
    ).toBeNull();
    expect(isAtMaxSequence(4, 4)).toBe(true);
  });

  it("allows repeat when max sequence is unlimited", () => {
    const sentAt = new Date("2026-01-01T12:00:00.000Z");
    const unlimited = { ...policy, maxSequenceEmails: null };
    expect(
      computeNextDueAt({ latestSentAt: sentAt, sentCount: 4, policy: unlimited }),
    ).toEqual(addDays(sentAt, 30));
  });

  it("classifies urgency relative to now", () => {
    const now = new Date("2026-03-15T12:00:00.000Z");
    expect(cadenceUrgency(new Date("2026-03-14T12:00:00.000Z"), now)).toBe(
      "overdue",
    );
    expect(cadenceUrgency(new Date("2026-03-15T08:00:00.000Z"), now)).toBe(
      "today",
    );
    expect(cadenceUrgency(new Date("2026-03-18T12:00:00.000Z"), now)).toBe(
      "this_week",
    );
  });

  it("detects meeting scheduling language for INTERESTED replies", () => {
    expect(
      isMeetingSchedulingReply(
        "INTERESTED",
        "Happy to chat — can we schedule a call next week?",
      ),
    ).toBe(true);
    expect(
      isMeetingSchedulingReply(
        "INTERESTED",
        "Send me more information about pricing.",
      ),
    ).toBe(false);
    expect(
      isMeetingSchedulingReply(
        "NOT_NOW",
        "Let's schedule something in Q3.",
      ),
    ).toBe(false);
  });
});

describe("cadence display conversion", () => {
  it("converts between gap storage and cumulative UI", () => {
    const display = policyToCumulativeDisplay(DEFAULT_CADENCE_POLICY);
    expect(display).toEqual({
      email2Day: 9,
      email3Day: 15,
      email4Day: 30,
      repeatEveryDays: 30,
    });
    const gaps = cumulativeDisplayToPolicyGaps(display);
    expect(gaps).toEqual({
      day2IntervalDays: 9,
      day3IntervalDays: 6,
      day4IntervalDays: 15,
      repeatIntervalDays: 30,
    });
  });

  it("rejects invalid cumulative ordering", () => {
    expect(
      validateCumulativeCadenceInput({
        email2Day: 9,
        email3Day: 8,
        email4Day: 30,
        repeatEveryDays: 30,
      }),
    ).toMatch(/Email 3 must be after Email 2/);
  });
});

describe("cadence engine — unrelated domain fixtures", () => {
  it("does not treat healthcare scheduling copy as meeting language when not INTERESTED", () => {
    expect(
      isMeetingSchedulingReply(
        "OBJECTION",
        "Our clinical scheduling platform already handles calendar workflows.",
      ),
    ).toBe(false);
  });

  it("computes due dates for a manufacturing follow-up policy", () => {
    const manufacturingPolicy = {
      day2IntervalDays: 14,
      day3IntervalDays: 7,
      day4IntervalDays: 21,
      repeatIntervalDays: 45,
      maxSequenceEmails: 4,
    };
    const sentAt = new Date("2026-06-01T09:00:00.000Z");
    expect(
      computeNextDueAt({
        latestSentAt: sentAt,
        sentCount: 2,
        policy: manufacturingPolicy,
      }),
    ).toEqual(addDays(sentAt, 7));
    expect(isDue(addDays(sentAt, 7), addDays(sentAt, 7))).toBe(true);
  });
});

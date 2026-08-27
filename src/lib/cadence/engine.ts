import type { CadencePolicyValues } from "@/lib/cadence/defaults";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

/** Gap in days after the Nth sent email before the next follow-up. */
export function gapDaysAfterSentCount(
  sentCount: number,
  policy: Pick<
    CadencePolicyValues,
    | "day2IntervalDays"
    | "day3IntervalDays"
    | "day4IntervalDays"
    | "repeatIntervalDays"
  >,
): number | null {
  if (sentCount <= 0) return null;
  if (sentCount === 1) return policy.day2IntervalDays;
  if (sentCount === 2) return policy.day3IntervalDays;
  if (sentCount === 3) return policy.day4IntervalDays;
  if (sentCount >= 4) return policy.repeatIntervalDays;
  return null;
}

export function isAtMaxSequence(
  sentCount: number,
  maxSequenceEmails: number | null,
): boolean {
  return maxSequenceEmails != null && sentCount >= maxSequenceEmails;
}

export function computeNextDueAt(input: {
  latestSentAt: Date;
  sentCount: number;
  policy: CadencePolicyValues;
}): Date | null {
  if (isAtMaxSequence(input.sentCount, input.policy.maxSequenceEmails)) {
    return null;
  }
  const gap = gapDaysAfterSentCount(input.sentCount, input.policy);
  if (gap == null) return null;
  return addDays(input.latestSentAt, gap);
}

export type CadenceUrgency = "overdue" | "today" | "this_week" | "later";

export function cadenceUrgency(
  nextDueAt: Date,
  now: Date = new Date(),
): CadenceUrgency {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  if (nextDueAt < startOfToday) return "overdue";
  if (nextDueAt < endOfToday) return "today";
  if (nextDueAt < endOfWeek) return "this_week";
  return "later";
}

export function isDue(nextDueAt: Date | null, now: Date = new Date()): boolean {
  return nextDueAt != null && now >= nextDueAt;
}

/** Detect meeting/scheduling language in an INTERESTED prospect reply. */
export function isMeetingSchedulingReply(
  classification: string,
  prospectReply: string,
): boolean {
  if (classification !== "INTERESTED") return false;
  const normalized = prospectReply.toLowerCase();
  const patterns = [
    /\bschedule\b/,
    /\bscheduling\b/,
    /\bcalendar\b/,
    /\bmeet(ing)?\b/,
    /\bbook\b.*\b(time|slot|call)\b/,
    /\b(set|find|pick)\s+(a\s+)?time\b/,
    /\bavailability\b/,
    /\bzoom\b/,
    /\bteams\b.*\bcall\b/,
    /\bvideo call\b/,
    /\bphone call\b/,
    /\blet'?s\s+(chat|talk|connect|meet)\b/,
    /\bwhen\s+(are\s+you|can\s+you)\s+(free|available)\b/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

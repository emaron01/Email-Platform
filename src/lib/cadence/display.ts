import type { CadencePolicyValues } from "@/lib/cadence/defaults";

/** Cumulative day labels shown in org cadence settings UI. */
export type CadenceCumulativeDisplay = {
  email2Day: number;
  email3Day: number;
  email4Day: number;
  repeatEveryDays: number;
};

export function policyToCumulativeDisplay(
  policy: Pick<
    CadencePolicyValues,
    | "day2IntervalDays"
    | "day3IntervalDays"
    | "day4IntervalDays"
    | "repeatIntervalDays"
  >,
): CadenceCumulativeDisplay {
  const email2Day = policy.day2IntervalDays;
  const email3Day = email2Day + policy.day3IntervalDays;
  const email4Day = email3Day + policy.day4IntervalDays;
  return {
    email2Day,
    email3Day,
    email4Day,
    repeatEveryDays: policy.repeatIntervalDays,
  };
}

/** Convert cumulative UI values back to gap storage. */
export function cumulativeDisplayToPolicyGaps(input: {
  email2Day: number;
  email3Day: number;
  email4Day: number;
  repeatEveryDays: number;
}): Pick<
  CadencePolicyValues,
  | "day2IntervalDays"
  | "day3IntervalDays"
  | "day4IntervalDays"
  | "repeatIntervalDays"
> {
  const day2IntervalDays = input.email2Day;
  const day3IntervalDays = input.email3Day - input.email2Day;
  const day4IntervalDays = input.email4Day - input.email3Day;
  return {
    day2IntervalDays,
    day3IntervalDays,
    day4IntervalDays,
    repeatIntervalDays: input.repeatEveryDays,
  };
}

export function validateCumulativeCadenceInput(input: {
  email2Day: number;
  email3Day: number;
  email4Day: number;
  repeatEveryDays: number;
}): string | null {
  if (
    !Number.isInteger(input.email2Day) ||
    !Number.isInteger(input.email3Day) ||
    !Number.isInteger(input.email4Day) ||
    !Number.isInteger(input.repeatEveryDays)
  ) {
    return "Cadence intervals must be whole numbers of days.";
  }
  if (input.email2Day < 1) {
    return "Email 2 must be at least day 1.";
  }
  if (input.email3Day <= input.email2Day) {
    return "Email 3 must be after Email 2.";
  }
  if (input.email4Day <= input.email3Day) {
    return "Email 4 must be after Email 3.";
  }
  if (input.repeatEveryDays < 1) {
    return "Repeat interval must be at least 1 day.";
  }
  return null;
}

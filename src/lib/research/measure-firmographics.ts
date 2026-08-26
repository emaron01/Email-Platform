/**
 * Firmographic signal detection for website-first measurement.
 * Used to flag qualification regressions when stage-1 skips web_search.
 */

export type FirmographicResearchRow = {
  companySummary?: string | null;
  whatTheySell?: string | null;
  businessModel?: string | null;
  companySizeContext?: string | null;
  estimatedAov?: string | null;
  aovReasoning?: string | null;
};

function researchTextBlob(row: FirmographicResearchRow): string {
  return [
    row.companySummary,
    row.whatTheySell,
    row.businessModel,
    row.companySizeContext,
    row.estimatedAov,
    row.aovReasoning,
  ]
    .map((v) => (v ?? "").toString().trim())
    .filter(Boolean)
    .join("\n");
}

export function hasCompanySizeContextPopulated(
  row: FirmographicResearchRow,
): boolean {
  return Boolean(row.companySizeContext?.trim());
}

const EMPLOYEE_SIGNAL =
  /\b(\d[\d,]*\s*[-–—]\s*\d[\d,]*|\d[\d,]+\+?)\s+(employees|people|staff)\b|\bheadcount\b|\bteam size\b|\bfte\b|\bfull[- ]time equivalent\b|\blinkedin\b.{0,100}\b(employee|employees|headcount|\d[\d,]*\s*[-–—]\s*\d[\d,]*)\b|\b(employee|employees).{0,60}\blinkedin\b|\b\d[\d,]+\s+employees\b/i;

const REVENUE_SIGNAL =
  /\brevenue\b|\barr\b|\bmrr\b|\bannual recurring\b|\$\d[\d,.]*\s*(million|billion|m|b|k)\b|\brevenue.{0,40}\$\d|\bvaluation\b|\bgross merchandise\b|\bgmv\b/i;

/** Employee/headcount signal — typically from LinkedIn, directories, or news via web_search. */
export function hasEmployeeCountSignal(row: FirmographicResearchRow): boolean {
  const ctx = row.companySizeContext?.trim() ?? "";
  const blob = researchTextBlob(row);
  return EMPLOYEE_SIGNAL.test(ctx) || EMPLOYEE_SIGNAL.test(blob);
}

/** Revenue/deal-size signal — estimatedAov, aovReasoning, or explicit revenue mentions. */
export function hasRevenueSignal(row: FirmographicResearchRow): boolean {
  if (row.estimatedAov?.trim()) return true;
  if (row.aovReasoning?.trim()) return true;
  return REVENUE_SIGNAL.test(researchTextBlob(row));
}

export type FirmographicComparison = {
  companySizeContextBefore: boolean;
  companySizeContextAfter: boolean;
  employeeSignalBefore: boolean;
  employeeSignalAfter: boolean;
  revenueSignalBefore: boolean;
  revenueSignalAfter: boolean;
  lostEmployeeCountSignal: boolean;
  lostRevenueSignal: boolean;
  qualificationRegression: boolean;
};

export function compareFirmographics(
  before: FirmographicResearchRow,
  after: FirmographicResearchRow,
): FirmographicComparison {
  const employeeSignalBefore = hasEmployeeCountSignal(before);
  const employeeSignalAfter = hasEmployeeCountSignal(after);
  const revenueSignalBefore = hasRevenueSignal(before);
  const revenueSignalAfter = hasRevenueSignal(after);
  const lostEmployeeCountSignal =
    employeeSignalBefore && !employeeSignalAfter;
  const lostRevenueSignal = revenueSignalBefore && !revenueSignalAfter;

  return {
    companySizeContextBefore: hasCompanySizeContextPopulated(before),
    companySizeContextAfter: hasCompanySizeContextPopulated(after),
    employeeSignalBefore,
    employeeSignalAfter,
    revenueSignalBefore,
    revenueSignalAfter,
    lostEmployeeCountSignal,
    lostRevenueSignal,
    qualificationRegression: lostEmployeeCountSignal || lostRevenueSignal,
  };
}

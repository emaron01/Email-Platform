/**
 * Client-safe research run types and helpers. No server imports — safe for
 * "use client" components. Server logic lives in runs.ts.
 */
export type ResearchRunStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

export type ResearchRunView = {
  id: string;
  contactListId: string;
  scoringRunId: string | null;
  status: ResearchRunStatus;
  forceRefresh: boolean;
  failuresOnly: boolean;
  retryOfRunId: string | null;
  totalCompanies: number;
  completedCount: number;
  failedCount: number;
  skippedFreshCount: number;
  quotaBlockedCount: number;
  currentCompanyName: string | null;
  lastError: string | null;
  failedCompanyIds: string[];
  quotaBlockedCompanyNames: string[];
  startedAt: string | null;
  completedAt: string | null;
  pausedAt: string | null;
};

export function isResearchRunPaused(
  run: Pick<ResearchRunView, "status" | "pausedAt">,
): boolean {
  return run.status === "IN_PROGRESS" && run.pausedAt != null;
}

export function isActiveResearchRunStatus(status: ResearchRunStatus): boolean {
  return status === "PENDING" || status === "IN_PROGRESS";
}

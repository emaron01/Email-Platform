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

/** No worker heartbeat for this long → UI treats the run as stalled (not live). */
export const RESEARCH_RUN_STALE_MS = 15 * 60 * 1000;

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
  workerHeartbeatAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  pausedAt: string | null;
};

export function isResearchRunPaused(
  run: Pick<ResearchRunView, "status" | "pausedAt">,
): boolean {
  return run.status === "IN_PROGRESS" && run.pausedAt != null;
}

export function isResearchRunStalled(
  run: Pick<
    ResearchRunView,
    "status" | "workerHeartbeatAt" | "startedAt" | "pausedAt"
  >,
  nowMs: number = Date.now(),
): boolean {
  if (run.status !== "IN_PROGRESS") return false;
  if (run.pausedAt != null) return false;
  const last = run.workerHeartbeatAt ?? run.startedAt;
  if (!last) return false;
  return nowMs - new Date(last).getTime() > RESEARCH_RUN_STALE_MS;
}

export function isTerminalResearchRunStatus(status: ResearchRunStatus): boolean {
  return (
    status === "COMPLETED" ||
    status === "PARTIAL" ||
    status === "FAILED" ||
    status === "CANCELLED"
  );
}

export function isActiveResearchRunStatus(status: ResearchRunStatus): boolean {
  return status === "PENDING" || status === "IN_PROGRESS";
}

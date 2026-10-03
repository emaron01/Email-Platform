import { formatResearchRunFailureSummary } from "@/lib/research/failure-classification";
import {
  isActiveResearchRunStatus,
  isResearchRunStalled,
  type ResearchRunView,
} from "@/lib/research/run-types";

/** Same interval the research panel uses while a run is in progress. */
export const LIST_PREPARATION_POLL_MS = 4_000;

export type ResearchStartStepInput = {
  ok: boolean;
  message: string;
  runId?: string;
  code?: "ACTIVE_RUN" | "NOTHING_TO_DO" | "INVALID_RETRY";
  activeRunId?: string;
  run?: ResearchRunView;
};

export type ListPreparationStep =
  | { type: "score" }
  | { type: "poll"; runId: string }
  | { type: "stop"; message: string; researchRunId: string | null };

export type ListPreparationOutcome =
  | { type: "done"; scoringRunId: string; message: string | null }
  | {
      type: "stop";
      message: string;
      researchRunId: string | null;
      kind: "research" | "scoring";
    };

export type ListPreparationDeps = {
  startResearch: () => Promise<ResearchStartStepInput>;
  pollStatus: (runId: string) => Promise<ResearchRunView | null>;
  researchGap: () => Promise<
    { ok: true; needingResearch: number } | { ok: false; message: string }
  >;
  createScoringRun: () => Promise<{
    ok: boolean;
    message: string;
    scoringRunId?: string;
  }>;
  scoreContacts: (scoringRunId: string) => Promise<{
    ok: boolean;
    message: string;
    status?: string;
  }>;
  sleep: () => Promise<void>;
  shouldContinue?: () => boolean;
};

export function researchStopMessage(
  run: ResearchRunView,
  needingResearch?: number,
): string {
  if (isResearchRunStalled(run)) {
    return run.lastError?.trim() || "Research stopped — no worker progress.";
  }
  const summary = formatResearchRunFailureSummary(run);
  if (summary) return summary;
  if (run.lastError?.trim()) return run.lastError.trim();
  if (run.status === "CANCELLED") return "Research was cancelled.";
  if (run.status === "FAILED") return "Research run failed.";
  if (needingResearch != null && needingResearch > 0) {
    return "Research finished with companies still needing research.";
  }
  return "Research did not finish.";
}

export function stepAfterResearchStart(
  result: ResearchStartStepInput,
): ListPreparationStep {
  if (result.ok && result.code === "NOTHING_TO_DO") return { type: "score" };
  if (!result.ok) {
    if (result.activeRunId) return { type: "poll", runId: result.activeRunId };
    return {
      type: "stop",
      message: result.message,
      researchRunId: result.runId ?? null,
    };
  }
  const runId = result.run?.id ?? result.runId ?? null;
  if (!runId) {
    return {
      type: "stop",
      message: result.message || "Research did not start.",
      researchRunId: null,
    };
  }
  return { type: "poll", runId };
}

export function stepAfterResearchPoll(input: {
  run: ResearchRunView | null;
  needingResearch: number | null;
}): ListPreparationStep {
  const run = input.run;
  if (!run) {
    return {
      type: "stop",
      message: "Research run was not found.",
      researchRunId: null,
    };
  }
  if (
    isActiveResearchRunStatus(run.status) &&
    !isResearchRunStalled(run)
  ) {
    return { type: "poll", runId: run.id };
  }
  if (
    isResearchRunStalled(run) ||
    run.status === "FAILED" ||
    run.status === "CANCELLED"
  ) {
    return {
      type: "stop",
      message: researchStopMessage(run),
      researchRunId: run.id,
    };
  }
  if (input.needingResearch == null) {
    return {
      type: "stop",
      message: "Unable to check whether company research finished.",
      researchRunId: run.id,
    };
  }
  if (input.needingResearch > 0) {
    return {
      type: "stop",
      message: researchStopMessage(run, input.needingResearch),
      researchRunId: run.id,
    };
  }
  if (run.status === "COMPLETED" || run.status === "PARTIAL") {
    return { type: "score" };
  }
  return {
    type: "stop",
    message: researchStopMessage(run, input.needingResearch),
    researchRunId: run.id,
  };
}

export function stepAfterScoring(result: {
  ok: boolean;
  message: string;
  status?: string;
}): { type: "done"; message: string | null } | { type: "stop"; message: string } {
  if (!result.ok || result.status === "FAILED") {
    return { type: "stop", message: result.message };
  }
  return {
    type: "done",
    message: result.status === "COMPLETED" ? null : result.message,
  };
}

export function isQualificationException(bucket: string): boolean {
  return bucket !== "GOOD";
}

function stopped(researchRunId: string | null = null): ListPreparationOutcome {
  return {
    type: "stop",
    message: "List preparation stopped.",
    researchRunId,
    kind: "research",
  };
}

function stillGoing(deps: ListPreparationDeps): boolean {
  return deps.shouldContinue ? deps.shouldContinue() : true;
}

async function scoreList(
  deps: ListPreparationDeps,
): Promise<ListPreparationOutcome> {
  if (!stillGoing(deps)) return stopped();
  const created = await deps.createScoringRun();
  if (!stillGoing(deps)) return stopped();
  if (!created.ok || !created.scoringRunId) {
    return {
      type: "stop",
      message: created.message,
      researchRunId: null,
      kind: "scoring",
    };
  }
  const scored = await deps.scoreContacts(created.scoringRunId);
  if (!stillGoing(deps)) return stopped();
  const after = stepAfterScoring(scored);
  if (after.type === "stop") {
    return {
      type: "stop",
      message: after.message,
      researchRunId: null,
      kind: "scoring",
    };
  }
  return {
    type: "done",
    scoringRunId: created.scoringRunId,
    message: after.message,
  };
}

async function pollResearch(
  deps: ListPreparationDeps,
  runId: string,
): Promise<ListPreparationOutcome> {
  for (;;) {
    if (!stillGoing(deps)) {
      return stopped(runId);
    }
    const latest = await deps.pollStatus(runId);
    if (!stillGoing(deps)) {
      return stopped(runId);
    }
    const stillRunning =
      latest != null &&
      isActiveResearchRunStatus(latest.status) &&
      !isResearchRunStalled(latest);
    let needingResearch: number | null = null;
    if (
      !stillRunning &&
      latest &&
      !isResearchRunStalled(latest) &&
      latest.status !== "FAILED" &&
      latest.status !== "CANCELLED"
    ) {
      const gap = await deps.researchGap();
      if (!stillGoing(deps)) {
        return stopped(runId);
      }
      if (!gap.ok) {
        return {
          type: "stop",
          message: gap.message,
          researchRunId: runId,
          kind: "research",
        };
      }
      needingResearch = gap.needingResearch;
    }
    const step = stepAfterResearchPoll({ run: latest, needingResearch });
    if (step.type === "poll") {
      await deps.sleep();
      continue;
    }
    if (step.type === "stop") {
      return {
        type: "stop",
        message: step.message,
        researchRunId: step.researchRunId,
        kind: "research",
      };
    }
    return scoreList(deps);
  }
}

export async function continueListPreparation(
  deps: ListPreparationDeps,
  started: ResearchStartStepInput,
): Promise<ListPreparationOutcome> {
  const step = stepAfterResearchStart(started);
  if (step.type === "stop") {
    return {
      type: "stop",
      message: step.message,
      researchRunId: step.researchRunId,
      kind: "research",
    };
  }
  if (step.type === "score") return scoreList(deps);
  return pollResearch(deps, step.runId);
}

export async function runListPreparation(
  deps: ListPreparationDeps,
): Promise<ListPreparationOutcome> {
  const started = await deps.startResearch();
  if (!stillGoing(deps)) return stopped();
  return continueListPreparation(deps, started);
}

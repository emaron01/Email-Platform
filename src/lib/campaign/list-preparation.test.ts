import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  continueListPreparation,
  isQualificationException,
  researchStopMessage,
  runListPreparation,
  type ListPreparationDeps,
  type ResearchStartStepInput,
} from "@/lib/campaign/list-preparation";
import {
  RESEARCH_RUN_STALE_MS,
  type ResearchRunView,
} from "@/lib/research/run-types";

function researchRun(
  partial: Partial<ResearchRunView> & Pick<ResearchRunView, "status">,
): ResearchRunView {
  return {
    id: "run_1",
    contactListId: "list_1",
    scoringRunId: null,
    forceRefresh: false,
    failuresOnly: false,
    retryOfRunId: null,
    totalCompanies: 3,
    completedCount: 0,
    failedCount: 0,
    skippedFreshCount: 0,
    quotaBlockedCount: 0,
    currentCompanyName: null,
    lastError: null,
    failedCompanyIds: [],
    quotaBlockedCompanyNames: [],
    workerHeartbeatAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    pausedAt: null,
    ...partial,
  };
}

function staleRun(status: ResearchRunView["status"] = "IN_PROGRESS"): ResearchRunView {
  const stale = new Date(Date.now() - RESEARCH_RUN_STALE_MS - 60_000).toISOString();
  return researchRun({
    status,
    workerHeartbeatAt: stale,
    startedAt: stale,
    pausedAt: null,
    lastError: "Research stopped — no worker progress.",
  });
}

function deps(
  start: ResearchStartStepInput,
  options?: {
    polls?: Array<ResearchRunView | null>;
    needingResearch?: number;
    gapOk?: boolean;
    gapMessage?: string;
    create?: { ok: boolean; message: string; scoringRunId?: string };
    score?: { ok: boolean; message: string; status?: string };
  },
) {
  const calls = {
    start: 0,
    poll: 0,
    gap: 0,
    create: 0,
    score: 0,
    sleep: 0,
  };
  const polls = [...(options?.polls ?? [])];
  const harness: ListPreparationDeps = {
    startResearch: async () => {
      calls.start += 1;
      return start;
    },
    pollStatus: async () => {
      calls.poll += 1;
      return polls.shift() ?? polls[polls.length - 1] ?? null;
    },
    researchGap: async () => {
      calls.gap += 1;
      if (options?.gapOk === false) {
        return { ok: false, message: options.gapMessage ?? "Unable to check company research." };
      }
      return { ok: true, needingResearch: options?.needingResearch ?? 0 };
    },
    createScoringRun: async () => {
      calls.create += 1;
      return (
        options?.create ?? {
          ok: true,
          message: "Scoring run created.",
          scoringRunId: "score_1",
        }
      );
    },
    scoreContacts: async () => {
      calls.score += 1;
      return (
        options?.score ?? {
          ok: true,
          message: "Scoring finished.",
          status: "COMPLETED",
        }
      );
    },
    sleep: async () => {
      calls.sleep += 1;
    },
  };
  return { harness, calls };
}

describe("campaign list preparation", () => {
  it("starts research and scoring from one selection", async () => {
    const { harness, calls } = deps(
      { ok: true, message: "Research started.", runId: "run_1" },
      {
        polls: [
          researchRun({ status: "IN_PROGRESS" }),
          researchRun({ status: "COMPLETED", completedCount: 3 }),
        ],
        needingResearch: 0,
      },
    );
    const outcome = await runListPreparation(harness);
    expect(outcome).toEqual({
      type: "done",
      scoringRunId: "score_1",
      message: null,
    });
    expect(calls).toMatchObject({ start: 1, poll: 2, create: 1, score: 1 });
  });

  it("skips research and scores when every company is already researched", async () => {
    const { harness, calls } = deps({
      ok: true,
      message: "All 4 unique companies already have fresh research.",
      code: "NOTHING_TO_DO",
    });
    const outcome = await runListPreparation(harness);
    expect(outcome.type).toBe("done");
    expect(calls.poll).toBe(0);
    expect(calls.gap).toBe(0);
    expect(calls.create).toBe(1);
    expect(calls.score).toBe(1);
  });

  it("scores a partial run once no companies still need research", async () => {
    const { harness, calls } = deps(
      { ok: true, message: "Research started.", runId: "run_1" },
      {
        polls: [researchRun({ status: "PARTIAL", completedCount: 3 })],
        needingResearch: 0,
      },
    );
    const outcome = await runListPreparation(harness);
    expect(outcome.type).toBe("done");
    expect(calls.score).toBe(1);
  });

  it("stops when research fails before a run exists", async () => {
    const { harness, calls } = deps({
      ok: false,
      message: "Research AI is not configured.",
    });
    const outcome = await runListPreparation(harness);
    expect(outcome).toEqual({
      type: "stop",
      message: "Research AI is not configured.",
      researchRunId: null,
      kind: "research",
    });
    expect(calls.poll).toBe(0);
    expect(calls.create).toBe(0);
    expect(calls.score).toBe(0);
  });

  it("stops a failed research run and does not score", async () => {
    const failed = researchRun({
      status: "FAILED",
      failedCount: 2,
      lastError: "Provider timed out",
    });
    const { harness, calls } = deps(
      { ok: true, message: "Research started.", runId: "run_1" },
      { polls: [failed] },
    );
    const outcome = await runListPreparation(harness);
    expect(outcome).toMatchObject({
      type: "stop",
      kind: "research",
      researchRunId: "run_1",
      message: researchStopMessage(failed),
    });
    expect(calls.score).toBe(0);
    expect(calls.create).toBe(0);
  });

  it("stops a cancelled research run and does not score", async () => {
    const cancelled = researchRun({
      status: "CANCELLED",
      lastError: "Research was cancelled.",
    });
    const { harness, calls } = deps(
      { ok: true, message: "Research started.", runId: "run_1" },
      { polls: [cancelled] },
    );
    const outcome = await runListPreparation(harness);
    expect(outcome).toMatchObject({
      type: "stop",
      kind: "research",
      message: researchStopMessage(cancelled),
    });
    expect(calls.score).toBe(0);
  });

  it("stops a stalled research run and does not score", async () => {
    const stalled = staleRun();
    const { harness, calls } = deps(
      { ok: true, message: "Research started.", runId: "run_1" },
      { polls: [stalled] },
    );
    const outcome = await runListPreparation(harness);
    expect(outcome).toMatchObject({
      type: "stop",
      kind: "research",
      message: researchStopMessage(stalled),
    });
    expect(calls.gap).toBe(0);
    expect(calls.score).toBe(0);
  });

  it("stops a partial run that still has unresearched companies", async () => {
    const partial = researchRun({
      status: "PARTIAL",
      failedCount: 1,
      lastError: "Company page did not load",
    });
    const { harness, calls } = deps(
      { ok: true, message: "Research started.", runId: "run_1" },
      { polls: [partial], needingResearch: 1 },
    );
    const outcome = await runListPreparation(harness);
    expect(outcome).toMatchObject({
      type: "stop",
      kind: "research",
      message: researchStopMessage(partial, 1),
    });
    expect(calls.score).toBe(0);
  });

  it("polls an already active run instead of treating it as a dead end", async () => {
    const { harness, calls } = deps(
      {
        ok: false,
        message: "Research is already running.",
        code: "ACTIVE_RUN",
        activeRunId: "run_live",
      },
      {
        polls: [researchRun({ id: "run_live", status: "COMPLETED" })],
        needingResearch: 0,
      },
    );
    const outcome = await runListPreparation(harness);
    expect(outcome.type).toBe("done");
    expect(calls.poll).toBe(1);
    expect(calls.score).toBe(1);
  });

  it("stops when scoring returns a failure message", async () => {
    const { harness, calls } = deps(
      {
        ok: true,
        message: "All companies already have fresh research.",
        code: "NOTHING_TO_DO",
      },
      { score: { ok: false, message: "Scoring is not configured." } },
    );
    const outcome = await runListPreparation(harness);
    expect(outcome).toEqual({
      type: "stop",
      message: "Scoring is not configured.",
      researchRunId: null,
      kind: "scoring",
    });
    expect(calls.score).toBe(1);
  });

  it("stops when the scoring run itself fails", async () => {
    const { harness } = deps(
      {
        ok: true,
        message: "All companies already have fresh research.",
        code: "NOTHING_TO_DO",
      },
      {
        score: {
          ok: true,
          message: "Scoring finished: 0 completed, 4 failed (run status: FAILED).",
          status: "FAILED",
        },
      },
    );
    const outcome = await runListPreparation(harness);
    expect(outcome).toMatchObject({
      type: "stop",
      kind: "scoring",
      message: "Scoring finished: 0 completed, 4 failed (run status: FAILED).",
    });
  });

  it("retries a failed run through the same continuation", async () => {
    const { harness, calls } = deps(
      { ok: true, message: "Retrying.", runId: "run_2", run: researchRun({ id: "run_2", status: "PENDING" }) },
      {
        polls: [researchRun({ id: "run_2", status: "COMPLETED" })],
        needingResearch: 0,
      },
    );
    const outcome = await continueListPreparation(harness, {
      ok: true,
      message: "Retrying.",
      runId: "run_2",
    });
    expect(outcome.type).toBe("done");
    expect(calls.start).toBe(0);
    expect(calls.score).toBe(1);
  });

  it("keeps Ready to include contacts out of the exception list", () => {
    expect(isQualificationException("GOOD")).toBe(false);
    expect(isQualificationException("NEEDS_REVIEW")).toBe(true);
    expect(isQualificationException("EXCLUDED")).toBe(true);
  });
});

describe("stage 5 seams", () => {
  const manager = readFileSync(
    "src/components/CampaignContactsManager.tsx",
    "utf8",
  );
  const page = readFileSync("src/app/(app)/campaigns/[id]/page.tsx", "utf8");
  const scoring = readFileSync("src/app/actions/scoring.ts", "utf8");
  const buckets = readFileSync(
    "src/components/QualificationBuckets.tsx",
    "utf8",
  );
  const approve = readFileSync(
    "src/components/SaveAndReturnToCampaignButton.tsx",
    "utf8",
  );

  it("chains the existing actions and approves with the existing attach", () => {
    expect(manager).toContain("runListPreparation");
    expect(manager).toContain("researchCompaniesForContactListAction");
    expect(manager).toContain("getResearchRunStatusAction");
    expect(manager).toContain('form.set("stayOnPage", "1")');
    expect(manager).toContain("scoreContactsAction");
    expect(manager).toContain("retryFailedResearchRunAction");
    expect(manager).toContain("List preparation is underway.");
    expect(manager).not.toContain("Companies that did not match");
    expect(manager).toContain("Contacts that did not match");
    expect(manager).toContain("QualificationBuckets");
    expect(manager).toContain('label="Approve"');
    expect(manager).not.toContain("completedCount");
    expect(approve).toContain("saveScoringRunAndReturnToCampaignAction");
    expect(scoring).toContain('stayOnPage") === "1"');
    expect(scoring).toContain("redirect(scoringRunHref");
    expect(page).not.toContain("Jump to scored runs");
    expect(page).not.toContain("Add from Scored Run");
    expect(buckets).toContain("overrideQualificationBucketAction");
    expect(buckets).toContain("EXCLUSION_REVIEW_COPY.addBack");
    expect(buckets).toContain("Move to");
  });

  it("leaves standalone list research and scoring in place", () => {
    const listPage = readFileSync("src/app/(app)/lists/[id]/page.tsx", "utf8");
    const scorePage = readFileSync(
      "src/app/(app)/lists/[id]/score/page.tsx",
      "utf8",
    );
    const scoreForm = readFileSync("src/components/ScoreListForm.tsx", "utf8");
    const scorePanel = readFileSync(
      "src/components/ScoreContactsPanel.tsx",
      "utf8",
    );
    const researchPanel = readFileSync(
      "src/components/ResearchRunPanel.tsx",
      "utf8",
    );
    expect(listPage).toContain("ResearchRunPanel");
    expect(listPage).toContain("CampaignListWorkflowButtons");
    expect(scorePage).toContain("ScoreListForm");
    expect(scoreForm).not.toContain("stayOnPage");
    expect(scorePanel).toContain("scoreContactsAction");
    expect(researchPanel).toContain("researchCompaniesForContactListAction");
    expect(researchPanel).toContain("getResearchRunStatusAction");
    expect(researchPanel).toContain("retryFailedResearchRunAction");
  });
});

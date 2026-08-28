"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getResearchRunStatusAction,
  researchCompaniesForContactListAction,
  researchCompaniesForScoringRunAction,
  retryFailedResearchRunAction,
  type ResearchStartResult,
} from "@/app/actions/research";
import { CompanyResearchAllowanceBanner } from "@/components/CompanyResearchAllowanceBanner";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
import {
  isResearchRunPaused,
  isActiveResearchRunStatus,
  type ResearchRunView,
} from "@/lib/research/run-types";
import {
  formatResearchAllowanceWarning,
  RESEARCH_BILLING_HREF,
  type ActiveResearchedCompanyUsageView,
} from "@/lib/usage/research-allowance";

export type ResearchPlanView = {
  totalContacts: number;
  uniqueCompanies: number;
  alreadyResearched: number;
  needingResearch: number;
  statusCounts: {
    completed: number;
    partial: number;
    failed: number;
    notStarted: number;
    inProgress: number;
  };
};

const POLL_MS = 4_000;

function isActiveRun(status: ResearchRunView["status"]): boolean {
  return isActiveResearchRunStatus(status);
}

function progressPercent(run: ResearchRunView): number {
  if (run.totalCompanies <= 0) return 0;
  const done =
    run.completedCount +
    run.failedCount +
    run.skippedFreshCount +
    run.quotaBlockedCount;
  return Math.min(100, Math.round((done / run.totalCompanies) * 100));
}

function formatRunSummary(run: ResearchRunView): string {
  const done =
    run.completedCount +
    run.failedCount +
    run.skippedFreshCount +
    run.quotaBlockedCount;

  if (isResearchRunPaused(run)) {
    return `Paused, resuming shortly. ${done} of ${run.totalCompanies} companies processed so far.`;
  }

  if (isActiveRun(run.status)) {
    const current = run.currentCompanyName
      ? ` Currently researching ${run.currentCompanyName}.`
      : "";
    return `Research in progress: ${done} of ${run.totalCompanies} companies processed.${current}`;
  }

  if (run.status === "COMPLETED") {
    return `Research complete: ${run.completedCount} completed, ${run.skippedFreshCount} skipped (fresh).`;
  }

  if (run.status === "PARTIAL") {
    return `Research finished with issues: ${run.completedCount} completed, ${run.failedCount} failed, ${run.quotaBlockedCount} quota-blocked, ${run.skippedFreshCount} skipped.`;
  }

  if (run.status === "FAILED") {
    return run.lastError ?? "Research run failed.";
  }

  return "Research run finished.";
}

export function ResearchRunPanel({
  runId,
  contactListId,
  plan,
  researchAiConfigured,
  allowance,
  initialActiveRun,
  initialLastRun,
}: {
  runId?: string;
  contactListId?: string;
  plan: ResearchPlanView;
  researchAiConfigured: boolean;
  allowance: ActiveResearchedCompanyUsageView;
  initialActiveRun?: ResearchRunView | null;
  initialLastRun?: ResearchRunView | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmWarning, setConfirmWarning] = useState<null | "research" | "refresh">(
    null,
  );
  const [activeRun, setActiveRun] = useState<ResearchRunView | null>(
    initialActiveRun ?? null,
  );
  const [lastRun, setLastRun] = useState<ResearchRunView | null>(
    initialLastRun ?? null,
  );

  useEffect(() => {
    setActiveRun(initialActiveRun ?? null);
  }, [initialActiveRun]);

  useEffect(() => {
    if (!initialLastRun) return;
    setLastRun(initialLastRun);
  }, [initialLastRun]);

  useEffect(() => {
    const run = activeRun;
    if (!run || !isActiveRun(run.status)) return;

    const interval = window.setInterval(async () => {
      const latest = await getResearchRunStatusAction(run.id);
      if (!latest) return;
      setActiveRun(latest);
      if (!isActiveRun(latest.status)) {
        setLastRun(latest);
        setMessage(formatRunSummary(latest));
        router.refresh();
      }
    }, POLL_MS);

    return () => window.clearInterval(interval);
  }, [activeRun, router]);

  function handleStartResult(result: ResearchStartResult) {
    setMessage(result.message);
    setConfirmWarning(null);
    if (result.run) {
      setActiveRun(result.run);
    } else if (result.activeRunId) {
      void getResearchRunStatusAction(result.activeRunId).then((run) => {
        if (run) setActiveRun(run);
      });
    }
    router.refresh();
  }

  function executeResearch(forceRefresh: boolean) {
    const formData = new FormData();
    if (contactListId) {
      formData.set("contactListId", contactListId);
    } else if (runId) {
      formData.set("scoringRunId", runId);
    }
    if (forceRefresh) formData.set("forceRefresh", "1");

    const action = contactListId
      ? researchCompaniesForContactListAction
      : researchCompaniesForScoringRunAction;

    startTransition(async () => {
      const result = await action(formData);
      handleStartResult(result);
    });
  }

  function requestResearch(forceRefresh: boolean) {
    const mode = forceRefresh ? "refresh" : "research";
    const wouldUseNewSlots =
      !forceRefresh || plan.needingResearch > 0 || plan.alreadyResearched > 0;
    if (
      allowance.warning &&
      !allowance.exhausted &&
      wouldUseNewSlots &&
      confirmWarning !== mode
    ) {
      setConfirmWarning(mode);
      return;
    }
    executeResearch(forceRefresh);
  }

  function retryFailed() {
    const targetRunId = lastRun?.id;
    if (!targetRunId) return;
    startTransition(async () => {
      const result = await retryFailedResearchRunAction(targetRunId);
      handleStartResult(result);
    });
  }

  const runInProgress = activeRun != null && isActiveRun(activeRun.status);
  const retryCount =
    (lastRun?.failedCompanyIds.length ?? 0) +
    (lastRun?.quotaBlockedCount ?? 0);
  const canRetry =
    lastRun != null &&
    !runInProgress &&
    (lastRun.status === "PARTIAL" || lastRun.status === "FAILED") &&
    retryCount > 0;

  const researchDisabled =
    pending ||
    runInProgress ||
    !researchAiConfigured ||
    plan.needingResearch === 0 ||
    (allowance.exhausted && plan.needingResearch > 0);

  const displayRun = runInProgress ? activeRun : lastRun;

  return (
    <div className="space-y-4">
      <CompanyResearchAllowanceBanner usage={allowance} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total Contacts" value={plan.totalContacts} />
        <Stat label="Unique Companies" value={plan.uniqueCompanies} />
        <Stat label="Already Researched" value={plan.alreadyResearched} />
        <Stat label="Need Research" value={plan.needingResearch} />
        <Stat label="Completed" value={plan.statusCounts.completed} />
        <Stat label="Partial" value={plan.statusCounts.partial} />
        <Stat label="Failed" value={plan.statusCounts.failed} />
        <Stat label="Not Started" value={plan.statusCounts.notStarted} />
      </div>

      {displayRun ? (
        <div
          className="space-y-2 rounded-md border border-slate-200 bg-white px-3 py-3"
          data-testid="research-run-progress"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="font-medium text-slate-900">
              {isResearchRunPaused(displayRun)
                ? "Research paused"
                : runInProgress
                  ? "Research running"
                  : "Last research run"}
            </p>
            <p className="text-slate-600">{displayRun.status.replace("_", " ")}</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-900 transition-all"
              style={{ width: `${progressPercent(displayRun)}%` }}
            />
          </div>
          <p className="text-sm text-slate-600">{formatRunSummary(displayRun)}</p>
          {displayRun.quotaBlockedCount > 0 ? (
            <p className="text-sm text-amber-900">
              {displayRun.quotaBlockedCount} companies were not researched due to
              allowance limits.{" "}
              <Link href={RESEARCH_BILLING_HREF} className="underline">
                Add capacity in Billing
              </Link>
              .
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-sm text-slate-600">
        Research runs once per unique company in the background. Results appear
        below as each company finishes. Uses Research AI only (independent from
        Scoring AI).
      </p>

      {!researchAiConfigured ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Automated company research is not configured. Set RESEARCH_AI_PROVIDER
          (openai-responses or openai-compatible), RESEARCH_AI_MODEL,
          RESEARCH_AI_MODEL_URL, and RESEARCH_AI_API_KEY. Manual research on
          company pages remains available. Scoring is unaffected.
        </p>
      ) : null}

      {allowance.exhausted && plan.needingResearch > 0 ? (
        <p
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950"
          data-testid="research-hard-stop"
        >
          New company research is stopped — your allowance is used. Refreshing
          companies you already researched still works.{" "}
          <Link
            href={RESEARCH_BILLING_HREF}
            className="font-medium underline underline-offset-2"
          >
            Add capacity in Billing
          </Link>
          .
        </p>
      ) : null}

      {confirmWarning ? (
        <div
          className="space-y-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950"
          data-testid="research-warning-confirm"
        >
          <p className="font-medium">
            {formatResearchAllowanceWarning(allowance.remaining)}
          </p>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton
              disabled={pending}
              onClick={() => executeResearch(confirmWarning === "refresh")}
            >
              Continue anyway
            </PrimaryButton>
            <Link
              href={RESEARCH_BILLING_HREF}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Buy more
            </Link>
            <SecondaryButton
              type="button"
              disabled={pending}
              onClick={() => setConfirmWarning(null)}
            >
              Cancel
            </SecondaryButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            disabled={researchDisabled}
            onClick={() => requestResearch(false)}
          >
            {pending
              ? "Starting…"
              : runInProgress
                ? "Research running…"
                : "Research Companies"}
          </PrimaryButton>
          <SecondaryButton
            disabled={
              pending ||
              runInProgress ||
              !researchAiConfigured ||
              plan.uniqueCompanies === 0
            }
            onClick={() => requestResearch(true)}
          >
            Refresh Research
          </SecondaryButton>
          {canRetry ? (
            <SecondaryButton disabled={pending} onClick={retryFailed}>
              Retry {retryCount} failed
            </SecondaryButton>
          ) : null}
        </div>
      )}

      {message ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

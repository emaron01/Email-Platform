"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { researchCompaniesForScoringRunAction } from "@/app/actions/research";
import { CompanyResearchAllowanceBanner } from "@/components/CompanyResearchAllowanceBanner";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
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

export function ResearchRunPanel({
  runId,
  plan,
  researchAiConfigured,
  allowance,
}: {
  runId: string;
  plan: ResearchPlanView;
  researchAiConfigured: boolean;
  allowance: ActiveResearchedCompanyUsageView;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmWarning, setConfirmWarning] = useState<null | "research" | "refresh">(
    null,
  );

  function executeResearch(forceRefresh: boolean) {
    const formData = new FormData();
    formData.set("scoringRunId", runId);
    if (forceRefresh) formData.set("forceRefresh", "1");

    startTransition(async () => {
      const result = await researchCompaniesForScoringRunAction(formData);
      setMessage(result.message);
      setConfirmWarning(null);
      router.refresh();
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

  const researchDisabled =
    pending ||
    !researchAiConfigured ||
    plan.needingResearch === 0 ||
    (allowance.exhausted && plan.needingResearch > 0);

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

      <p className="text-sm text-slate-600">
        Research runs once per unique company, not once per contact. Uses
        Research AI configuration only (independent from Scoring AI).
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
            {pending ? "Working…" : "Research Companies"}
          </PrimaryButton>
          <SecondaryButton
            disabled={
              pending ||
              !researchAiConfigured ||
              plan.uniqueCompanies === 0
            }
            onClick={() => requestResearch(true)}
          >
            Refresh Research
          </SecondaryButton>
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

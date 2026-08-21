"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { researchCompaniesForScoringRunAction } from "@/app/actions/research";
import { PrimaryButton, SecondaryButton } from "@/components/ui";

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
}: {
  runId: string;
  plan: ResearchPlanView;
  researchAiConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function runResearch(forceRefresh: boolean) {
    const formData = new FormData();
    formData.set("scoringRunId", runId);
    if (forceRefresh) formData.set("forceRefresh", "1");

    startTransition(async () => {
      const result = await researchCompaniesForScoringRunAction(formData);
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
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

      <div className="flex flex-wrap gap-2">
        <PrimaryButton
          disabled={
            pending ||
            !researchAiConfigured ||
            plan.needingResearch === 0
          }
          onClick={() => runResearch(false)}
        >
          {pending ? "Working…" : "Research Companies"}
        </PrimaryButton>
        <SecondaryButton
          disabled={
            pending ||
            !researchAiConfigured ||
            plan.uniqueCompanies === 0
          }
          onClick={() => runResearch(true)}
        >
          Refresh Research
        </SecondaryButton>
      </div>

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

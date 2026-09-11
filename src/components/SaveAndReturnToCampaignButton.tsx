"use client";

import { useFormStatus } from "react-dom";
import { saveScoringRunAndReturnToCampaignAction } from "@/app/actions/campaign-contacts";

function SubmitButton({
  testId,
}: {
  testId: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid={testId}
      className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save and return to campaign"}
    </button>
  );
}

/** Attaches Ready to include contacts, then navigates to the campaign. */
export function SaveAndReturnToCampaignButton({
  campaignId,
  scoringRunId,
  testId = "back-to-campaign",
}: {
  campaignId: string;
  scoringRunId: string;
  testId?: string;
}) {
  return (
    <form action={saveScoringRunAndReturnToCampaignAction}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="scoringRunId" value={scoringRunId} />
      <SubmitButton testId={testId} />
    </form>
  );
}

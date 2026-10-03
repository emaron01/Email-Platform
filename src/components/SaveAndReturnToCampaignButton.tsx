"use client";

import { useFormStatus } from "react-dom";
import { saveScoringRunAndReturnToCampaignAction } from "@/app/actions/campaign-contacts";
import { SECONDARY_BUTTON_CLASS } from "@/components/ui";

function SubmitButton({
  testId,
  label,
}: {
  testId: string;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid={testId}
      className={SECONDARY_BUTTON_CLASS}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

/** Attaches Ready to include contacts, then navigates to the campaign. */
export function SaveAndReturnToCampaignButton({
  campaignId,
  scoringRunId,
  testId = "back-to-campaign",
  label = "Save and return to campaign",
}: {
  campaignId: string;
  scoringRunId: string;
  testId?: string;
  label?: string;
}) {
  return (
    <form action={saveScoringRunAndReturnToCampaignAction}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="scoringRunId" value={scoringRunId} />
      <SubmitButton testId={testId} label={label} />
    </form>
  );
}

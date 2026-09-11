"use client";

import Link from "next/link";
import {
  campaignListScoreButtonLabel,
  listScoreHref,
} from "@/lib/lists/campaign-query";

const headerButtonClass =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3.5 py-2 text-sm font-medium transition";

/**
 * Header actions when a list was opened from a campaign ( ?campaign= ).
 * Guides Research → Score for that campaign. Not used on normal list visits.
 */
export function CampaignListWorkflowButtons({
  listId,
  campaignId,
  campaignName,
  researchComplete,
}: {
  listId: string;
  campaignId: string;
  campaignName: string;
  researchComplete: boolean;
}) {
  function showResearch() {
    document.getElementById("company-research")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    if (!researchComplete) {
      document.getElementById("research-companies-start")?.click();
    }
  }

  const scoreLabel = campaignListScoreButtonLabel(
    campaignName,
    researchComplete,
  );

  return (
    <>
      <button
        type="button"
        onClick={showResearch}
        data-testid="campaign-list-research-button"
        aria-label={
          researchComplete
            ? "Research Companies, complete"
            : "Research Companies"
        }
        className={
          researchComplete
            ? `${headerButtonClass} bg-emerald-600 text-white hover:bg-emerald-500`
            : `${headerButtonClass} bg-slate-900 text-white hover:bg-slate-800`
        }
      >
        {researchComplete ? (
          <>
            <span
              aria-hidden="true"
              className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-semibold text-emerald-600"
            >
              ✓
            </span>
            Research Companies
          </>
        ) : (
          "Research Companies"
        )}
      </button>
      {researchComplete ? (
        <Link
          href={listScoreHref(listId, campaignId)}
          data-testid="campaign-list-score-button"
          className={`${headerButtonClass} bg-slate-900 text-white hover:bg-slate-800`}
        >
          {scoreLabel}
        </Link>
      ) : (
        <span
          data-testid="campaign-list-score-button"
          title="Research companies on this list first"
          className={`${headerButtonClass} cursor-not-allowed border border-slate-300 bg-slate-100 text-slate-500`}
        >
          {scoreLabel}
        </span>
      )}
    </>
  );
}

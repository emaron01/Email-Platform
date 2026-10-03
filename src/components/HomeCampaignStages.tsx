import Link from "next/link";
import {
  campaignStageMarker,
  type CampaignStage,
  type CampaignStageKey,
} from "@/lib/workflow/campaign-stages";

export function HomeCampaignStages({
  campaignId,
  stages,
  currentStage,
}: {
  campaignId: string;
  stages: CampaignStage[];
  currentStage: CampaignStageKey;
}) {
  return (
    <div className="mt-4">
      <ol
        className="flex flex-wrap items-center gap-1"
        data-testid={`home-campaign-stages-${campaignId}`}
      >
        {stages.map((stage) => {
          const marker = campaignStageMarker(stage, currentStage);
          const circle = (
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${marker.className}`}
            >
              {marker.text}
            </span>
          );
          const label = (
            <span className="text-xs font-medium">{stage.label}</span>
          );
          return (
            <li key={stage.key}>
              {stage.available ? (
                <Link
                  href={`/campaigns/${campaignId}?stage=${stage.key}`}
                  data-testid={`home-campaign-stage-${campaignId}-${stage.key}`}
                  aria-current={currentStage === stage.key ? "step" : undefined}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-slate-700 hover:bg-slate-50"
                >
                  {circle}
                  {label}
                </Link>
              ) : (
                <span
                  title={stage.unavailableReason ?? undefined}
                  aria-disabled="true"
                  data-testid={`home-campaign-stage-${campaignId}-${stage.key}`}
                  className="flex cursor-not-allowed items-center gap-1.5 rounded-md px-1.5 py-1 text-slate-400"
                >
                  {circle}
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-slate-500">
        click where you left off to continue.
      </p>
    </div>
  );
}

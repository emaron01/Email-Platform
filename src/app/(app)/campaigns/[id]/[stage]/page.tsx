import { notFound, redirect } from "next/navigation";
import {
  CAMPAIGN_STAGE_KEYS,
  type CampaignStageKey,
} from "@/lib/workflow/campaign-stages";

/** Pre-merge Send stage path bookmarks → Emails. */
const LEGACY_STAGE_REDIRECTS: Record<string, CampaignStageKey> = {
  send: "emails",
};

export default async function LegacyCampaignStagePage({
  params,
}: {
  params: Promise<{ id: string; stage: string }>;
}) {
  const { id, stage } = await params;
  const redirected = LEGACY_STAGE_REDIRECTS[stage];
  if (redirected) {
    redirect(`/campaigns/${id}?stage=${redirected}`);
  }
  if (!CAMPAIGN_STAGE_KEYS.includes(stage as CampaignStageKey)) {
    notFound();
  }
  redirect(`/campaigns/${id}?stage=${stage}`);
}

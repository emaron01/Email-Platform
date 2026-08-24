import { notFound, redirect } from "next/navigation";
import {
  CAMPAIGN_STAGE_KEYS,
  type CampaignStageKey,
} from "@/lib/workflow/campaign-stages";

export default async function LegacyCampaignStagePage({
  params,
}: {
  params: Promise<{ id: string; stage: string }>;
}) {
  const { id, stage } = await params;
  if (!CAMPAIGN_STAGE_KEYS.includes(stage as CampaignStageKey)) {
    notFound();
  }
  redirect(`/campaigns/${id}?stage=${stage}`);
}

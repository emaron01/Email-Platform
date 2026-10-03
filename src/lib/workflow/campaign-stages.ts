export const CAMPAIGN_STAGE_KEYS = [
  "setup",
  "list",
  "companies",
  "contacts",
  "emails",
  "report",
] as const;

export type CampaignStageKey = (typeof CAMPAIGN_STAGE_KEYS)[number];

export type CampaignStage = {
  number: number;
  key: CampaignStageKey;
  label: string;
  completed: boolean;
  available: boolean;
  unavailableReason: string | null;
};

export function buildCampaignStages(input: {
  setupComplete: boolean;
  hasListData: boolean;
  companyResultCount: number;
  survivingCompanyCount: number;
  qualifiedContactCount: number;
  generatedEmailCount: number;
  sentEmailCount: number;
  /**
   * Contacts whose next email is due. Emails stays incomplete while this is
   * above zero, and also while the campaign has no drafts yet.
   */
  dueContactCount: number;
}): CampaignStage[] {
  const stages: CampaignStage[] = [
    {
      number: 4,
      key: "setup",
      label: "Setup",
      completed: input.setupComplete,
      available: true,
      unavailableReason: null,
    },
    {
      number: 5,
      key: "list",
      label: "List",
      completed: input.hasListData,
      available: input.setupComplete,
      unavailableReason: input.setupComplete
        ? null
        : "Complete campaign setup first.",
    },
    {
      number: 6,
      key: "companies",
      label: "Companies",
      completed: input.hasListData,
      available: input.hasListData,
      unavailableReason: input.hasListData
        ? null
        : "Attach or score a list first.",
    },
    {
      number: 7,
      key: "contacts",
      label: "Contacts",
      completed: input.hasListData,
      available: input.hasListData,
      unavailableReason: input.hasListData
        ? null
        : "Attach or score a list first.",
    },
    {
      number: 8,
      key: "emails",
      label: "Emails",
      completed:
        input.generatedEmailCount > 0 && input.dueContactCount === 0,
      available: input.hasListData || input.generatedEmailCount > 0,
      unavailableReason:
        input.hasListData || input.generatedEmailCount > 0
          ? null
          : "Attach or score a list first.",
    },
    {
      number: 9,
      key: "report",
      label: "Report",
      completed: false,
      available: input.sentEmailCount > 0,
      unavailableReason:
        input.sentEmailCount > 0 ? null : "Send at least one email first.",
    },
  ];
  return stages;
}

export function resolveCampaignStage(
  requested: string | undefined,
  stages: CampaignStage[],
): CampaignStageKey {
  // Legacy Send stage deep links land on the merged Emails workspace.
  const normalized =
    requested === "send" ? "emails" : requested;
  const requestedStage = stages.find(
    (stage) => stage.key === normalized && stage.available,
  );
  if (requestedStage) return requestedStage.key;
  return (
    stages.find((stage) => stage.available && !stage.completed)?.key ??
    stages.filter((stage) => stage.available).at(-1)?.key ??
    "setup"
  );
}

/** Shared marker for the top rail and the in-campaign side nav. */
export function campaignStageMarker(
  stage: Pick<CampaignStage, "completed" | "key" | "number">,
  currentStage: CampaignStageKey,
): { className: string; text: string } {
  if (stage.completed) {
    return { className: "bg-emerald-600 text-white", text: "✓" };
  }
  if (stage.key === currentStage) {
    return { className: "bg-red-600 text-white", text: String(stage.number) };
  }
  return { className: "bg-slate-200 text-slate-600", text: String(stage.number) };
}

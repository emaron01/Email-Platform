export const CAMPAIGN_STAGE_KEYS = [
  "setup",
  "list",
  "companies",
  "contacts",
  "emails",
  "send",
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
      completed: input.companyResultCount > 0,
      available: input.hasListData,
      unavailableReason: input.hasListData
        ? null
        : "Attach or score a list first.",
    },
    {
      number: 7,
      key: "contacts",
      label: "Contacts",
      completed: input.qualifiedContactCount > 0,
      available: input.survivingCompanyCount > 0,
      unavailableReason:
        input.survivingCompanyCount > 0
          ? null
          : "At least one company must be in Good before reviewing contacts.",
    },
    {
      number: 8,
      key: "emails",
      label: "Emails",
      completed: input.generatedEmailCount > 0,
      available:
        input.qualifiedContactCount > 0 || input.generatedEmailCount > 0,
      unavailableReason:
        input.qualifiedContactCount > 0 || input.generatedEmailCount > 0
          ? null
          : "At least one qualified contact is required.",
    },
    {
      number: 9,
      key: "send",
      label: "Send",
      completed: input.sentEmailCount > 0,
      available: input.generatedEmailCount > 0,
      unavailableReason:
        input.generatedEmailCount > 0
          ? null
          : "Generate at least one email first.",
    },
    {
      number: 10,
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
  const requestedStage = stages.find(
    (stage) => stage.key === requested && stage.available,
  );
  if (requestedStage) return requestedStage.key;
  return (
    stages.find((stage) => stage.available && !stage.completed)?.key ??
    stages.filter((stage) => stage.available).at(-1)?.key ??
    "setup"
  );
}

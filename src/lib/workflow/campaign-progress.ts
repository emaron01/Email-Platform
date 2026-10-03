import { countDueCampaignContacts } from "@/lib/cadence/engine";
import {
  buildCampaignStages,
  type CampaignStage,
} from "@/lib/workflow/campaign-stages";

type ProgressContact = {
  status: string;
  sequenceStoppedAt: Date | null;
  nextDueAt: Date | null;
  emailDrafts: ReadonlyArray<{ status: string }>;
  contact: {
    id: string;
    company: string | null;
    companyId: string | null;
  };
};

type ProgressCompanyRow = {
  id: string;
  name: string;
  bucket: string;
  canOverride: boolean;
};

type ProgressContactRow = {
  id: string;
  bucket: string;
  companyId?: string | null;
};

/**
 * One stage snapshot for the top rail, the in-campaign side nav, and later
 * the Home campaign rows. Callers pass the campaign detail and its
 * qualification view.
 */
export function deriveCampaignProgress<
  TCompany extends ProgressCompanyRow,
  TContact extends ProgressContactRow,
>(input: {
  productId: string;
  icpId: string;
  contacts: ReadonlyArray<ProgressContact>;
  companyRows: ReadonlyArray<TCompany>;
  contactRows: ReadonlyArray<TContact>;
  now?: Date;
}): {
  stages: CampaignStage[];
  campaignCompanyRows: TCompany[];
  campaignContactRows: TContact[];
  qualifiedContactCount: number;
  generatedEmailCount: number;
  sentEmailCount: number;
  dueContactCount: number;
} {
  const generatedEmailCount = input.contacts.reduce(
    (total, entry) => total + entry.emailDrafts.length,
    0,
  );
  const sentEmailCount = input.contacts.reduce(
    (total, entry) =>
      total +
      entry.emailDrafts.filter((draft) => draft.status === "SENT").length,
    0,
  );
  const dueContactCount = countDueCampaignContacts(input.contacts, input.now);
  const attachedContactIds = new Set(
    input.contacts.map((entry) => entry.contact.id),
  );
  const attachedCompanyIds = new Set(
    input.contacts
      .map((entry) => entry.contact.companyId)
      .filter((value): value is string => Boolean(value)),
  );
  const attachedCompanyNames = new Set(
    input.contacts
      .map((entry) => entry.contact.company?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );
  const campaignCompanyRows = input.companyRows.filter((row) =>
    row.canOverride
      ? attachedCompanyIds.has(row.id)
      : attachedCompanyNames.has(row.name.trim().toLowerCase()),
  );
  const campaignContactRows = input.contactRows.filter((row) =>
    attachedContactIds.has(row.id),
  );
  const excludedCompanyIds = new Set(
    campaignCompanyRows
      .filter((row) => row.bucket === "EXCLUDED" && row.canOverride)
      .map((row) => row.id),
  );
  const qualifiedContactCount = campaignContactRows.filter(
    (row) =>
      row.bucket === "GOOD" &&
      (!row.companyId || !excludedCompanyIds.has(row.companyId)),
  ).length;
  const stages = buildCampaignStages({
    setupComplete: Boolean(input.productId && input.icpId),
    hasListData: input.contacts.length > 0,
    companyResultCount: campaignCompanyRows.length,
    survivingCompanyCount: campaignCompanyRows.filter(
      (row) => row.bucket === "GOOD",
    ).length,
    qualifiedContactCount,
    generatedEmailCount,
    sentEmailCount,
    dueContactCount,
  });
  return {
    stages,
    campaignCompanyRows,
    campaignContactRows,
    qualifiedContactCount,
    generatedEmailCount,
    sentEmailCount,
    dueContactCount,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ScoreReportClientRow } from "@/components/ScoreDetailPanel";
import {
  addContactsToCampaign,
  addScoringRunContactsToCampaign,
  getScoringRunQualificationRows,
} from "@/lib/campaign/contacts";
import {
  campaignAfterScoringAttachHref,
  campaignReturnFromScoringHref,
} from "@/lib/lists/campaign-query";
import { prisma } from "@/lib/prisma";
import {
  contactMatchesSuppressionSet,
  listActiveNormalizedEmails,
} from "@/lib/suppression/service";
import { getScoreReportRows } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";

export type CampaignContactsActionResult = {
  ok: boolean;
  message: string;
  addedCount?: number;
};

function campaignIdFrom(formData: FormData): string {
  return String(formData.get("campaignId") ?? "").trim();
}

function revalidateCampaign(campaignId: string): void {
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
}

function toSafeCampaignContactsError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  return "Unable to add contacts to this campaign. Please try again.";
}

export async function addContactsToCampaignAction(
  _prev: CampaignContactsActionResult | null,
  formData: FormData,
): Promise<CampaignContactsActionResult> {
  const campaignId = campaignIdFrom(formData);
  if (!campaignId) return { ok: false, message: "Campaign is required." };

  try {
    const addedCount = await addContactsToCampaign({
      campaignId,
      contactIds: formData
        .getAll("contactIds")
        .map((value) => String(value).trim())
        .filter(Boolean),
    });
    revalidateCampaign(campaignId);
    return {
      ok: true,
      message:
        addedCount === 0
          ? "All selected contacts are already attached."
          : `${addedCount} contact${addedCount === 1 ? "" : "s"} added.`,
      addedCount,
    };
  } catch (error) {
    console.error("Failed to add campaign contacts.", error);
    return { ok: false, message: toSafeCampaignContactsError(error) };
  }
}

export async function addScoringRunContactsToCampaignAction(
  _prev: CampaignContactsActionResult | null,
  formData: FormData,
): Promise<CampaignContactsActionResult> {
  const campaignId = campaignIdFrom(formData);
  const scoringRunId = String(formData.get("scoringRunId") ?? "").trim();
  if (!campaignId) return { ok: false, message: "Campaign is required." };
  if (!scoringRunId) {
    return { ok: false, message: "Select a scoring run." };
  }

  try {
    const addedCount = await addScoringRunContactsToCampaign({
      campaignId,
      scoringRunId,
    });
    revalidateCampaign(campaignId);
    return {
      ok: true,
      message:
        addedCount === 0
          ? "All scored contacts are already attached."
          : `${addedCount} scored contact${addedCount === 1 ? "" : "s"} added.`,
      addedCount,
    };
  } catch (error) {
    console.error("Failed to add scored campaign contacts.", error);
    return { ok: false, message: toSafeCampaignContactsError(error) };
  }
}

export async function loadScoringRunQualificationAction(
  scoringRunId: string,
): Promise<
  | {
      ok: true;
      companyRows: Awaited<
        ReturnType<typeof getScoringRunQualificationRows>
      >["companyRows"];
      contactRows: Awaited<
        ReturnType<typeof getScoringRunQualificationRows>
      >["contactRows"];
    }
  | { ok: false; message: string }
> {
  if (!scoringRunId.trim()) {
    return { ok: false, message: "Scoring run is required." };
  }
  try {
    const view = await getScoringRunQualificationRows(scoringRunId);
    return {
      ok: true,
      companyRows: view.companyRows,
      contactRows: view.contactRows,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : "Unable to load qualification.",
    };
  }
}

export type QualificationScoreDetailResult =
  | { ok: true; rows: ScoreReportClientRow[] }
  | { ok: false; message: string };

function scoreDetailMatchesTarget(
  row: Awaited<ReturnType<typeof getScoreReportRows>>[number],
  targetType: "CONTACT" | "COMPANY",
  targetId: string,
): boolean {
  if (targetType === "CONTACT") return row.contactId === targetId;
  if (targetId.startsWith("name:")) {
    const name = targetId.slice("name:".length).trim().toLowerCase();
    const company = (
      row.contact.companyRecord?.name ??
      row.contact.company ??
      ""
    )
      .trim()
      .toLowerCase();
    return Boolean(name) && company === name;
  }
  return row.contact.companyId === targetId;
}

function toScoreDetailRow(
  row: Awaited<ReturnType<typeof getScoreReportRows>>[number],
  suppressed: boolean,
): ScoreReportClientRow {
  return {
    id: row.id,
    contactId: row.contactId,
    overallScore: row.overallScore,
    icpScore: row.icpScore,
    personaScore: row.personaScore,
    companyScore: row.companyScore,
    productRelevanceScore: row.productRelevanceScore,
    scoreLabel: row.scoreLabel,
    recommendedAction: row.recommendedAction,
    companySummary: row.companySummary,
    whatTheySell: row.whatTheySell,
    estimatedAov: row.estimatedAov,
    aovReasoning: row.aovReasoning,
    fitStrengths: row.fitStrengths,
    fitRisks: row.fitRisks,
    disqualifiers: row.disqualifiers,
    reasoning: row.reasoning,
    researchStatus: row.researchStatus,
    researchSources: row.researchSources,
    scoringStatus: row.scoringStatus,
    assessmentData: row.assessmentData,
    aiProvider: row.aiProvider,
    aiModel: row.aiModel,
    aiModelUrlIdentifier: row.aiModelUrlIdentifier,
    promptVersion: row.promptVersion,
    scoringLogicVersion: row.scoringLogicVersion,
    scoredAt: row.scoredAt ? row.scoredAt.toISOString() : null,
    scoringError: row.scoringError,
    suppressed,
    contact: {
      id: row.contact.id,
      firstName: row.contact.firstName,
      lastName: row.contact.lastName,
      email: row.contact.email,
      title: row.contact.title,
      company: row.contact.company,
      companyId: row.contact.companyId,
      companyRecord: row.contact.companyRecord
        ? {
            id: row.contact.companyRecord.id,
            name: row.contact.companyRecord.name,
            website: row.contact.companyRecord.website,
            normalizedDomain: row.contact.companyRecord.normalizedDomain,
            research: row.contact.companyRecord.research.map((research) => ({
              id: research.id,
              status: research.status,
              researchMethod: research.researchMethod,
              companySummary: research.companySummary,
              whatTheySell: research.whatTheySell,
              estimatedAov: research.estimatedAov,
              aovReasoning: research.aovReasoning,
              customerTypes: research.customerTypes,
              primaryMarkets: research.primaryMarkets,
              businessModel: research.businessModel,
              companySizeContext: research.companySizeContext,
              relevantTechnologies: research.relevantTechnologies,
              buyingSignals: research.buyingSignals,
              riskSignals: research.riskSignals,
              researchSources: research.researchSources,
              researchedAt: research.researchedAt
                ? research.researchedAt.toISOString()
                : null,
            })),
          }
        : null,
    },
  };
}

export async function loadQualificationScoreDetailAction(input: {
  scoringRunId: string;
  targetType: "CONTACT" | "COMPANY";
  targetId: string;
}): Promise<QualificationScoreDetailResult> {
  const scoringRunId = input.scoringRunId.trim();
  const targetId = input.targetId.trim();
  if (!scoringRunId || !targetId) {
    return { ok: false, message: "Scoring run and row are required." };
  }
  if (input.targetType !== "CONTACT" && input.targetType !== "COMPANY") {
    return { ok: false, message: "Score detail target is not valid." };
  }
  try {
    const rows = await getScoreReportRows(scoringRunId);
    const matched = rows.filter((row) =>
      scoreDetailMatchesTarget(row, input.targetType, targetId),
    );
    if (matched.length === 0) {
      return {
        ok: false,
        message: "No score detail is available for this row.",
      };
    }
    const organization = await getCurrentOrganization();
    if (!organization) {
      return { ok: false, message: "No active organization." };
    }
    const suppression = await listActiveNormalizedEmails(
      organization.id,
      matched.map((row) => row.contact.email),
    );
    return {
      ok: true,
      rows: matched.map((row) =>
        toScoreDetailRow(
          row,
          row.scoringStatus === "SUPPRESSED" ||
            contactMatchesSuppressionSet(row.contact.email, suppression),
        ),
      ),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : "Unable to load score detail.",
    };
  }
}

/**
 * Score-report return: attach Ready to include (GOOD) contacts from this run,
 * then land on Emails (or List if the campaign still has no contacts).
 * Scoring engine behavior is unchanged — attach + navigation only.
 */
export async function saveScoringRunAndReturnToCampaignAction(
  formData: FormData,
) {
  const campaignId = campaignIdFrom(formData);
  const scoringRunId = String(formData.get("scoringRunId") ?? "").trim();
  if (!campaignId || !scoringRunId) {
    throw new TenantError("Campaign and scoring run are required.");
  }

  let attachedCount = 0;
  let attachFailed = false;
  try {
    attachedCount = await addScoringRunContactsToCampaign({
      campaignId,
      scoringRunId,
      qualificationBuckets: ["GOOD"],
    });
  } catch (error) {
    console.error("Failed to save scoring run back to campaign.", error);
    attachFailed = true;
  }

  revalidateCampaign(campaignId);

  // redirect() throws — keep outside the attach try/catch.
  if (attachFailed) {
    redirect(campaignReturnFromScoringHref(campaignId, scoringRunId));
  }

  const { requireOrganizationId } = await import(
    "@/lib/tenant/getCurrentOrganization"
  );
  const organizationId = await requireOrganizationId();
  const contactCount = await prisma.campaignContact.count({
    where: {
      campaignId,
      organizationId,
    },
  });
  redirect(
    campaignAfterScoringAttachHref(campaignId, {
      hasContacts: contactCount > 0,
      attachedCount,
    }),
  );
}

"use server";

import { revalidatePath } from "next/cache";
import {
  getCompaniesNeedingResearchForScoringRun,
  researchCompany,
  runResearchForScoringRun,
  updateManualCompanyResearch,
} from "@/lib/tenant/companies";
import { TenantError } from "@/lib/tenant/getCurrentOrganization";
import type { ResearchConfidence } from "@prisma/client";
import {
  formatResearchAllowanceExhausted,
  RESEARCH_BILLING_HREF,
} from "@/lib/usage/research-allowance";

function requiredString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function parseLineList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatQuotaBlockedSummary(input: {
  quotaBlocked: number;
  quotaBlockedCompanyNames: string[];
  completed: number;
  limit: number;
}): string {
  const names = input.quotaBlockedCompanyNames;
  const preview = names.slice(0, 5).join(", ");
  const more =
    names.length > 5 ? ` and ${names.length - 5} more` : names.length > 0 ? "" : "";
  const listed =
    names.length > 0
      ? ` Not researched: ${preview}${more}.`
      : "";

  if (input.completed > 0) {
    return (
      `Researched ${input.completed} compan${input.completed === 1 ? "y" : "ies"} ` +
      `with your remaining allowance. ${input.quotaBlocked} left unresearched because ` +
      `the allowance is used (${input.limit} companies). Add capacity in Billing.` +
      listed
    );
  }

  return formatResearchAllowanceExhausted(input.limit) + listed;
}

export async function researchCompaniesForScoringRunAction(
  formData: FormData,
): Promise<{
  ok: boolean;
  message: string;
  attempted?: number;
  skippedFresh?: number;
  failed?: number;
  completed?: number;
  quotaBlocked?: number;
  exhausted?: boolean;
  warning?: boolean;
  remaining?: number;
  billingHref?: string;
}> {
  const scoringRunId = requiredString(formData, "scoringRunId");
  const forceRefresh = requiredString(formData, "forceRefresh") === "1";

  if (!scoringRunId) {
    return { ok: false, message: "Scoring run is required." };
  }

  try {
    const plan = await getCompaniesNeedingResearchForScoringRun(scoringRunId);
    if (!forceRefresh && plan.needingResearch === 0) {
      revalidatePath(`/scoring/${scoringRunId}`);
      return {
        ok: true,
        message: `All ${plan.uniqueCompanies} unique companies already have fresh research.`,
        attempted: 0,
        skippedFresh: plan.alreadyResearched,
        failed: 0,
        completed: 0,
        quotaBlocked: 0,
        billingHref: RESEARCH_BILLING_HREF,
      };
    }

    const result = await runResearchForScoringRun(scoringRunId, {
      forceRefresh,
    });

    revalidatePath(`/scoring/${scoringRunId}`);

    if (result.quotaBlocked > 0) {
      return {
        ok: result.completed > 0,
        message: formatQuotaBlockedSummary({
          quotaBlocked: result.quotaBlocked,
          quotaBlockedCompanyNames: result.quotaBlockedCompanyNames,
          completed: result.completed,
          limit: result.allowance.limit,
        }),
        ...result,
        exhausted: result.allowance.exhausted,
        remaining: result.allowance.remaining,
        billingHref: RESEARCH_BILLING_HREF,
      };
    }

    if (
      result.attempted > 0 &&
      result.completed === 0 &&
      result.failed === 0 &&
      result.skippedFresh === result.attempted
    ) {
      return {
        ok: true,
        message:
          "Automated company research is not configured. Set RESEARCH_AI_* in .env.local (or Render). Manual research on company pages still works.",
        ...result,
        billingHref: RESEARCH_BILLING_HREF,
      };
    }

    if (result.failed > 0 && result.completed === 0) {
      return {
        ok: false,
        message: `Research failed for ${result.failed} compan${result.failed === 1 ? "y" : "ies"}. Prior successful research was preserved where available.`,
        ...result,
        billingHref: RESEARCH_BILLING_HREF,
      };
    }

    return {
      ok: true,
      message: `Research pass finished: ${result.completed} completed, ${result.failed} failed, ${result.skippedFresh} skipped (fresh/unconfigured).`,
      ...result,
      remaining: result.allowance.remaining,
      exhausted: result.allowance.exhausted,
      billingHref: RESEARCH_BILLING_HREF,
    };
  } catch (error) {
    const message =
      error instanceof TenantError
        ? error.message
        : "Unable to run company research.";
    return { ok: false, message };
  }
}

export type ResearchActionResult = {
  ok: boolean;
  message: string;
};

export async function refreshCompanyResearchAction(
  _prev: ResearchActionResult | null,
  formData: FormData,
): Promise<ResearchActionResult> {
  try {
    const companyId = requiredString(formData, "companyId");
    if (!companyId) {
      return { ok: false, message: "Company is required." };
    }

    const result = await researchCompany(companyId, { force: true });
    revalidatePath(`/companies/${companyId}`);
    if (result.quotaBlocked) {
      return {
        ok: false,
        message:
          result.reason ??
          formatResearchAllowanceExhausted(0) +
            ` Add capacity at ${RESEARCH_BILLING_HREF}.`,
      };
    }
    return { ok: true, message: "Research refreshed." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : "Unable to refresh company research.",
    };
  }
}

export async function updateManualCompanyResearchAction(
  _prev: ResearchActionResult | null,
  formData: FormData,
): Promise<ResearchActionResult> {
  try {
    const companyId = requiredString(formData, "companyId");
    if (!companyId) {
      return { ok: false, message: "Company is required." };
    }

    const confidenceRaw = requiredString(formData, "researchConfidence");
    const confidence =
      confidenceRaw === "HIGH" ||
      confidenceRaw === "MEDIUM" ||
      confidenceRaw === "LOW"
        ? (confidenceRaw as ResearchConfidence)
        : "MEDIUM";

    await updateManualCompanyResearch({
      companyId,
      companySummary: requiredString(formData, "companySummary") || null,
      whatTheySell: requiredString(formData, "whatTheySell") || null,
      estimatedAov: requiredString(formData, "estimatedAov") || null,
      aovReasoning: requiredString(formData, "aovReasoning") || null,
      customerTypes: parseLineList(
        String(formData.get("customerTypes") ?? ""),
      ),
      primaryMarkets: parseLineList(
        String(formData.get("primaryMarkets") ?? ""),
      ),
      businessModel: requiredString(formData, "businessModel") || null,
      companySizeContext: requiredString(formData, "companySizeContext") || null,
      relevantTechnologies: parseLineList(
        String(formData.get("relevantTechnologies") ?? ""),
      ),
      buyingSignals: parseLineList(
        String(formData.get("buyingSignals") ?? ""),
      ),
      riskSignals: parseLineList(String(formData.get("riskSignals") ?? "")),
      researchConfidence: confidence,
    });

    revalidatePath(`/companies/${companyId}`);
    return { ok: true, message: "Manual research saved." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : "Unable to save manual company research.",
    };
  }
}

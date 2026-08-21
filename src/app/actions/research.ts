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

function requiredString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function parseLineList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
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
      };
    }

    const result = await runResearchForScoringRun(scoringRunId, {
      forceRefresh,
    });

    revalidatePath(`/scoring/${scoringRunId}`);

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
      };
    }

    if (result.failed > 0 && result.completed === 0) {
      return {
        ok: false,
        message: `Research failed for ${result.failed} compan${result.failed === 1 ? "y" : "ies"}. Prior successful research was preserved where available.`,
        ...result,
      };
    }

    return {
      ok: true,
      message: `Research pass finished: ${result.completed} completed, ${result.failed} failed, ${result.skippedFresh} skipped (fresh/unconfigured).`,
      ...result,
    };
  } catch (error) {
    const message =
      error instanceof TenantError
        ? error.message
        : "Unable to run company research.";
    return { ok: false, message };
  }
}

export async function refreshCompanyResearchAction(
  formData: FormData,
): Promise<void> {
  const companyId = requiredString(formData, "companyId");
  if (!companyId) throw new TenantError("Company is required.");

  await researchCompany(companyId, { force: true });
  revalidatePath(`/companies/${companyId}`);
}

export async function updateManualCompanyResearchAction(
  formData: FormData,
): Promise<void> {
  const companyId = requiredString(formData, "companyId");
  if (!companyId) throw new TenantError("Company is required.");

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
}

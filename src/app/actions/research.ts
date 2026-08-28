"use server";

import { revalidatePath } from "next/cache";
import {
  getCompaniesNeedingResearchForContactList,
  getCompaniesNeedingResearchForScoringRun,
  researchCompany,
  updateManualCompanyResearch,
} from "@/lib/tenant/companies";
import {
  requireOrganizationId,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { requireCurrentUser } from "@/lib/auth/session";
import type { ResearchConfidence } from "@prisma/client";
import {
  formatResearchAllowanceExhausted,
  RESEARCH_BILLING_HREF,
} from "@/lib/usage/research-allowance";
import {
  canRetryResearchRun,
  createResearchRun,
  getActiveResearchRunForContactList,
  getResearchRunForOrganization,
  requireResearchRunInOrganization,
  type ResearchRunView,
} from "@/lib/research/runs";

function requiredString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function parseLineList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export type ResearchStartResult = {
  ok: boolean;
  message: string;
  runId?: string;
  code?: "ACTIVE_RUN" | "NOTHING_TO_DO" | "INVALID_RETRY";
  activeRunId?: string;
  run?: ResearchRunView;
};

async function startResearchRun(input: {
  contactListId: string;
  forceRefresh: boolean;
  scoringRunId?: string;
  revalidatePathname: string;
}): Promise<ResearchStartResult> {
  const organizationId = await requireOrganizationId();
  const user = await requireCurrentUser();

  const result = await createResearchRun({
    organizationId,
    contactListId: input.contactListId,
    initiatedByUserId: user.id,
    forceRefresh: input.forceRefresh,
    scoringRunId: input.scoringRunId,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      code: result.code,
      activeRunId: "activeRunId" in result ? result.activeRunId : undefined,
    };
  }

  revalidatePath(input.revalidatePathname);
  return {
    ok: true,
    message: input.forceRefresh
      ? `Refreshing research for ${result.run.totalCompanies} companies in the background.`
      : `Research started for ${result.run.totalCompanies} companies in the background.`,
    runId: result.run.id,
    run: result.run,
  };
}

export async function researchCompaniesForContactListAction(
  formData: FormData,
): Promise<ResearchStartResult> {
  const contactListId = requiredString(formData, "contactListId");
  const forceRefresh = requiredString(formData, "forceRefresh") === "1";

  if (!contactListId) {
    return { ok: false, message: "Contact list is required." };
  }

  try {
    if (!forceRefresh) {
      const plan = await getCompaniesNeedingResearchForContactList(contactListId);
      if (plan.needingResearch === 0) {
        return {
          ok: true,
          message: `All ${plan.uniqueCompanies} unique companies already have fresh research.`,
          code: "NOTHING_TO_DO",
        };
      }
    }

    return await startResearchRun({
      contactListId,
      forceRefresh,
      revalidatePathname: `/lists/${contactListId}`,
    });
  } catch (error) {
    const message =
      error instanceof TenantError
        ? error.message
        : "Unable to start company research.";
    return { ok: false, message };
  }
}

export async function researchCompaniesForScoringRunAction(
  formData: FormData,
): Promise<ResearchStartResult> {
  const scoringRunId = requiredString(formData, "scoringRunId");
  const forceRefresh = requiredString(formData, "forceRefresh") === "1";

  if (!scoringRunId) {
    return { ok: false, message: "Scoring run is required." };
  }

  try {
    const organizationId = await requireOrganizationId();
    const { prisma } = await import("@/lib/prisma");
    const run = await prisma.scoringRun.findFirst({
      where: { id: scoringRunId, organizationId },
      select: { contactListId: true },
    });
    if (!run) {
      return { ok: false, message: "Scoring run not found." };
    }

    if (!forceRefresh) {
      const plan = await getCompaniesNeedingResearchForScoringRun(scoringRunId);
      if (plan.needingResearch === 0) {
        return {
          ok: true,
          message: `All ${plan.uniqueCompanies} unique companies already have fresh research.`,
          code: "NOTHING_TO_DO",
        };
      }
    }

    return await startResearchRun({
      contactListId: run.contactListId,
      forceRefresh,
      scoringRunId,
      revalidatePathname: `/scoring/${scoringRunId}`,
    });
  } catch (error) {
    const message =
      error instanceof TenantError
        ? error.message
        : "Unable to start company research.";
    return { ok: false, message };
  }
}

export async function getResearchRunStatusAction(
  runId: string,
): Promise<ResearchRunView | null> {
  const organizationId = await requireOrganizationId();
  return getResearchRunForOrganization(runId, organizationId);
}

export async function getActiveResearchRunForListAction(
  contactListId: string,
): Promise<ResearchRunView | null> {
  const organizationId = await requireOrganizationId();
  return getActiveResearchRunForContactList(contactListId, organizationId);
}

export async function retryFailedResearchRunAction(
  runId: string,
): Promise<ResearchStartResult> {
  try {
    const organizationId = await requireOrganizationId();
    const user = await requireCurrentUser();
    const prior = await requireResearchRunInOrganization(runId, organizationId);

    if (!canRetryResearchRun(prior)) {
      return {
        ok: false,
        message: "This run has no failed or quota-blocked companies to retry.",
        code: "NOTHING_TO_DO",
      };
    }

    const result = await createResearchRun({
      organizationId,
      contactListId: prior.contactListId,
      initiatedByUserId: user.id,
      failuresOnly: true,
      retryOfRunId: prior.id,
      scoringRunId: prior.scoringRunId ?? undefined,
    });

    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        code: result.code,
        activeRunId: "activeRunId" in result ? result.activeRunId : undefined,
      };
    }

    const revalidatePathname = prior.scoringRunId
      ? `/scoring/${prior.scoringRunId}`
      : `/lists/${prior.contactListId}`;
    revalidatePath(revalidatePathname);

    return {
      ok: true,
      message: `Retrying ${result.run.totalCompanies} failed or blocked companies in the background.`,
      runId: result.run.id,
      run: result.run,
    };
  } catch (error) {
    const message =
      error instanceof TenantError
        ? error.message
        : "Unable to retry company research.";
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
    const contactListId = requiredString(formData, "contactListId");
    if (contactListId) {
      revalidatePath(`/lists/${contactListId}`);
    }
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

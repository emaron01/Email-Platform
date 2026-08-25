"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AiConfigError } from "@/lib/ai/errors";
import { runScoringForRun } from "@/lib/scoring/engine";
import { ALL_PERSONAS_VALUE } from "@/lib/scoring/title-fit";
import { createScoringRun } from "@/lib/tenant/data";
import { TenantError } from "@/lib/tenant/getCurrentOrganization";

function requiredString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function toSafeScoringRunActionError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  return "Unable to create scoring run. Please try again.";
}

export type ScoringRunActionResult = {
  ok: boolean;
  message: string;
};

export async function createScoringRunAction(
  _prev: ScoringRunActionResult | null,
  formData: FormData,
): Promise<ScoringRunActionResult> {
  const contactListId = requiredString(formData, "contactListId");
  const productId = requiredString(formData, "productId");
  const icpId = requiredString(formData, "icpId");
  const personaRaw = requiredString(formData, "personaId");
  const allPersonas = personaRaw === ALL_PERSONAS_VALUE;

  if (!contactListId || !productId || !icpId || (!allPersonas && !personaRaw)) {
    return { ok: false, message: "Product, ICP, and Persona are required." };
  }

  try {
    const { listIcpCriteria } = await import("@/lib/interpretation/icp");
    const { requireOrganizationId } = await import(
      "@/lib/tenant/getCurrentOrganization"
    );
    const {
      criterionMaterialFingerprint,
      isTargetedSearchDecisionStale,
      normalizeEvidenceClass,
    } = await import("@/lib/criteria/evidence-class");
    const organizationId = await requireOrganizationId();
    const criteria = await listIcpCriteria(organizationId, icpId);
    const undecided = criteria.filter((c) => {
      const evidenceClass = normalizeEvidenceClass(c.evidenceClass);
      if (evidenceClass !== "TARGETED_SEARCH") return false;
      const fp = criterionMaterialFingerprint({
        name: c.name,
        description: c.description,
        criterionType: c.criterionType,
        evidenceClass,
        operator: c.operator,
        targetValue: c.targetValue,
        minValue: c.minValue,
        maxValue: c.maxValue,
        allowedValues: c.allowedValues,
      });
      return isTargetedSearchDecisionStale({
        decision: c.targetedSearchDecision,
        storedFingerprint: c.targetedSearchDecisionFingerprint,
        currentFingerprint: fp,
      });
    });
    if (undecided.length > 0) {
      return {
        ok: false,
        message: `Decide how to treat per-company lookup criteria before scoring: ${undecided
          .map((c) => `"${c.name}"`)
          .join(", ")}.`,
      };
    }
  } catch (error) {
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    // Fall through to create — org resolution failures surface from createScoringRun.
  }

  let run;
  try {
    run = await createScoringRun({
      contactListId,
      productId,
      icpId,
      personaId: allPersonas ? null : personaRaw,
    });
  } catch (error) {
    return { ok: false, message: toSafeScoringRunActionError(error) };
  }

  // redirect() throws — keep it outside try/catch so navigation still fires.
  redirect(`/scoring/${run.id}`);
}

export async function scoreContactsAction(
  formData: FormData,
): Promise<{
  ok: boolean;
  message: string;
  completed?: number;
  failed?: number;
  status?: string;
}> {
  const scoringRunId = requiredString(formData, "scoringRunId");
  const forceRescore = requiredString(formData, "forceRescore") === "1";

  if (!scoringRunId) {
    return { ok: false, message: "Scoring run is required." };
  }

  try {
    const summary = await runScoringForRun(scoringRunId, { forceRescore });
    revalidatePath(`/scoring/${scoringRunId}`);
    return {
      ok: true,
      message: `Scoring finished: ${summary.completed} completed, ${summary.failed} failed (run status: ${summary.status}).`,
      completed: summary.completed,
      failed: summary.failed,
      status: summary.status,
    };
  } catch (error) {
    if (error instanceof AiConfigError) {
      return { ok: false, message: error.message };
    }
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    const message =
      error instanceof Error ? error.message : "Unable to score contacts.";
    return { ok: false, message };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AiConfigError } from "@/lib/ai/errors";
import { runScoringForRun } from "@/lib/scoring/engine";
import { createScoringRun } from "@/lib/tenant/data";
import { TenantError } from "@/lib/tenant/getCurrentOrganization";

function requiredString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createScoringRunAction(
  formData: FormData,
): Promise<void> {
  const contactListId = requiredString(formData, "contactListId");
  const productId = requiredString(formData, "productId");
  const icpId = requiredString(formData, "icpId");
  const personaId = requiredString(formData, "personaId");

  if (!contactListId || !productId || !icpId || !personaId) {
    throw new TenantError("Product, ICP, and Persona are required.");
  }

  const run = await createScoringRun({
    contactListId,
    productId,
    icpId,
    personaId,
  });

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

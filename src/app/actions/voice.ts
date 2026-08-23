"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/authz";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import {
  createVoiceSample,
  deleteVoiceSampleForUser,
  listVoiceSamplesForUser,
  type VoiceSampleView,
} from "@/lib/voice/samples";

export type VoiceActionResult = {
  ok: boolean;
  message: string;
  voiceSampleId?: string;
  samples?: VoiceSampleView[];
};

function toSafeVoiceError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  return "Unable to update voice samples. Please try again.";
}

export async function saveVoiceSampleAction(
  _prev: VoiceActionResult | null,
  formData: FormData,
): Promise<VoiceActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const created = await createVoiceSample({
      organizationId,
      userId: user.id,
      label: String(formData.get("label") ?? ""),
      sampleText: String(formData.get("sampleText") ?? ""),
    });
    revalidatePath("/settings/account");
    return {
      ok: true,
      message: "Voice sample saved.",
      voiceSampleId: created.id,
    };
  } catch (error) {
    return { ok: false, message: toSafeVoiceError(error) };
  }
}

export async function getVoiceSamplesAction(): Promise<VoiceActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const samples = await listVoiceSamplesForUser({
      organizationId,
      userId: user.id,
    });
    return {
      ok: true,
      message: samples.length === 1 ? "1 sample." : `${samples.length} samples.`,
      samples,
    };
  } catch (error) {
    return { ok: false, message: toSafeVoiceError(error) };
  }
}

export async function deleteVoiceSampleAction(
  _prev: VoiceActionResult | null,
  formData: FormData,
): Promise<VoiceActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const voiceSampleId = String(formData.get("voiceSampleId") ?? "").trim();
    if (!voiceSampleId) {
      return { ok: false, message: "Voice sample is required." };
    }
    await deleteVoiceSampleForUser({
      organizationId,
      userId: user.id,
      voiceSampleId,
    });
    revalidatePath("/settings/account");
    return { ok: true, message: "Voice sample removed." };
  } catch (error) {
    return { ok: false, message: toSafeVoiceError(error) };
  }
}

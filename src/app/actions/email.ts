"use server";

import { revalidatePath } from "next/cache";
import { requireVerifiedForAiSpend } from "@/lib/auth/authz";
import { loadEmailGenerationContext } from "@/lib/email-generation/context";
import { buildEmailPrompt } from "@/lib/email-generation/prompt";
import {
  generateEmailDraft,
  toSafeEmailGenerationError,
} from "@/lib/email-generation/service";

export type GenerateEmailDraftActionResult = {
  ok: boolean;
  message: string;
  draftId?: string;
  subject?: string;
  body?: string;
};

export async function generateEmailDraftAction(
  campaignContactId: string,
): Promise<GenerateEmailDraftActionResult> {
  try {
    const user = await requireVerifiedForAiSpend();
    const context = await loadEmailGenerationContext(
      campaignContactId,
      user.id,
    );
    const messages = buildEmailPrompt(context);
    const draft = await generateEmailDraft(context, messages);

    revalidatePath("/campaigns");
    return {
      ok: true,
      message: "Email draft generated.",
      draftId: draft.draftId,
      subject: draft.subject,
      body: draft.body,
    };
  } catch (error) {
    console.error("Email draft generation failed.", error);
    return {
      ok: false,
      message: toSafeEmailGenerationError(error),
    };
  }
}

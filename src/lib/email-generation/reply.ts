import "server-only";

import { z } from "zod";
import { getEmailAiConfig, getEmailAiProvider } from "@/lib/ai";
import type { ReplyClassification } from "@prisma/client";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import { PROSPECT_REPLY_MAX_CHARS } from "@/lib/email-generation/reply-contract";
import { recordUsageEvent } from "@/lib/usage/events";

export { PROSPECT_REPLY_MAX_CHARS };

const replyClassificationSchema = z.object({
  classification: z.enum([
    "INTERESTED",
    "OBJECTION",
    "REFERRAL",
    "NOT_NOW",
    "NOT_INTERESTED",
  ]),
  referralSuggested: z.boolean(),
  referralDetails: z.string().trim().max(1_000).nullable(),
  reasoning: z.string().trim().min(1).max(2_000),
});

export type ProspectReplyClassification = {
  classification: ReplyClassification;
  referralSuggested: boolean;
  referralDetails: string | null;
};

export async function classifyProspectReply(input: {
  context: EmailGenerationContext;
  sourceDraft: { subject: string; body: string };
  prospectReply: string;
}): Promise<ProspectReplyClassification> {
  const started = Date.now();
  const config = getEmailAiConfig();
  const ai = getEmailAiProvider();

  try {
    const response = await ai.generateStructured({
      messages: [
        {
          role: "system",
          content:
            "Classify a prospect reply into exactly one category: INTERESTED, OBJECTION, REFERRAL, NOT_NOW, or NOT_INTERESTED. REFERRAL means they direct the sender to another person. NOT_NOW means timing rather than rejection. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              originalSentEmail: input.sourceDraft,
              prospectReplyVerbatim: input.prospectReply,
              classifications: {
                INTERESTED: "Positive interest or willingness to engage.",
                OBJECTION:
                  "Concern or pushback that should be answered specifically.",
                REFERRAL:
                  "Directs the sender to another person or role.",
                NOT_NOW:
                  "Timing is the blocker; future contact may be welcome.",
                NOT_INTERESTED:
                  "Clear decline or request not to continue.",
              },
            },
            null,
            2,
          ),
        },
      ],
      schema: replyClassificationSchema,
      schemaName: "prospect_reply_classification",
    });
    await recordUsageEvent({
      organizationId: input.context.organizationId,
      userId: input.context.userId,
      campaignId: input.context.campaign.id,
      contactId: input.context.contact.id,
      category: "EMAIL_GENERATION",
      operation: "EMAIL_REPLY_CLASSIFIED",
      provider: response.provider,
      model: response.model,
      inputTokens: response.usage?.inputTokens ?? null,
      outputTokens: response.usage?.outputTokens ?? null,
      status: "SUCCESS",
      durationMs: Date.now() - started,
      metadata: {
        classification: response.data.classification,
        referralSuggested: response.data.referralSuggested,
      },
    });
    return {
      classification: response.data.classification,
      referralSuggested:
        response.data.classification === "REFERRAL" ||
        response.data.referralSuggested,
      referralDetails: response.data.referralDetails,
    };
  } catch (error) {
    await recordUsageEvent({
      organizationId: input.context.organizationId,
      userId: input.context.userId,
      campaignId: input.context.campaign.id,
      contactId: input.context.contact.id,
      category: "EMAIL_GENERATION",
      operation: "EMAIL_REPLY_CLASSIFIED",
      provider: config.provider,
      model: config.model,
      status: "FAILED",
      durationMs: Date.now() - started,
      metadata: {
        errorType:
          error instanceof Error ? error.constructor.name : "UnknownError",
      },
    });
    throw error;
  }
}

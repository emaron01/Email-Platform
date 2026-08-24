import type { EmailGenerationContext } from "@/lib/email-generation/context";
import {
  campaignOfferText,
  detectDeterministicOfferConflicts,
  offerConflictsFromJson,
  type OfferConflict,
} from "@/lib/campaign/offer-validation";

export function unacknowledgedOfferWarnings(
  context: EmailGenerationContext,
): OfferConflict[] {
  const acknowledged =
    Boolean(context.campaign.offerConflictAcknowledgedAt) &&
    context.campaign.offerConflictAcknowledgedHash ===
      context.campaign.offerValidationHash;
  if (acknowledged) return [];
  const stored = offerConflictsFromJson(
    context.campaign.offerValidationJson,
  );
  if (stored.length > 0) return stored;
  return detectDeterministicOfferConflicts({
    offerText: campaignOfferText(context.campaign),
    claimsNotToMake: context.product.messaging.claimsNotToMake,
    terminologyToAvoid: context.product.messaging.terminologyToAvoid,
  });
}

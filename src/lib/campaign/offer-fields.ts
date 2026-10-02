import type { CampaignOfferFields } from "@/lib/campaign/offer-validation";

/**
 * The campaign offer both the Setup and Emails stages display.
 * Column values win; a legacy linked Offer fills any blank column.
 */
export function campaignOfferView(campaign: {
  offerName: string | null;
  offerDescription: string | null;
  offerCta: string | null;
  offerNotes: string | null;
  offer?: {
    name: string | null;
    description: string | null;
    primaryCta: string | null;
    notes: string | null;
  } | null;
}): CampaignOfferFields {
  return {
    offerName: campaign.offerName ?? campaign.offer?.name ?? null,
    offerDescription:
      campaign.offerDescription ?? campaign.offer?.description ?? null,
    offerCta: campaign.offerCta ?? campaign.offer?.primaryCta ?? null,
    offerNotes: campaign.offerNotes ?? campaign.offer?.notes ?? null,
  };
}

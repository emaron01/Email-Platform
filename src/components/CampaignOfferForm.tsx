"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  updateCampaignOfferAction,
  type CampaignOfferActionResult,
} from "@/app/actions/campaign-offer";
import type { CampaignOfferFields } from "@/lib/campaign/offer-validation";
import { Field, SubmitButton } from "@/components/ui";

const initial: CampaignOfferActionResult | null = null;

export function CampaignOfferForm({
  campaignId,
  offer,
}: {
  campaignId: string;
  offer: CampaignOfferFields;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateCampaignOfferAction,
    initial,
  );
  const values = state?.values ?? offer;

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      {state ? (
        <p
          role="status"
          data-testid="campaign-offer-status"
          className={
            state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Offer Name"
          name="offerName"
          defaultValue={values.offerName}
        />
        <Field
          label="Primary CTA"
          name="offerCta"
          defaultValue={values.offerCta}
        />
        <div className="md:col-span-2">
          <Field
            label="Offer Description"
            name="offerDescription"
            as="textarea"
            defaultValue={values.offerDescription}
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Offer Notes"
            name="offerNotes"
            as="textarea"
            defaultValue={values.offerNotes}
          />
        </div>
      </div>

      <SubmitButton disabled={pending}>
        {pending ? "Validating…" : "Save offer"}
      </SubmitButton>
    </form>
  );
}

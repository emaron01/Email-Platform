"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  updateCampaignOfferAction,
  type CampaignOfferActionResult,
} from "@/app/actions/campaign-offer";
import type {
  CampaignOfferFields,
  OfferConflict,
} from "@/lib/campaign/offer-validation";
import { Field, SubmitButton } from "@/components/ui";

const initial: CampaignOfferActionResult | null = null;

export function CampaignOfferForm({
  campaignId,
  offer,
  conflicts,
  conflictsAcknowledged,
}: {
  campaignId: string;
  offer: CampaignOfferFields;
  conflicts: OfferConflict[];
  conflictsAcknowledged: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateCampaignOfferAction,
    initial,
  );
  const values = state?.values ?? offer;
  const visibleConflicts = state?.offerConflicts ?? conflicts;
  const needsAcknowledgment =
    state?.requiresOfferAcknowledgment ??
    (visibleConflicts.length > 0 && !conflictsAcknowledged);

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

      {visibleConflicts.length > 0 ? (
        <div
          className={
            conflictsAcknowledged && !needsAcknowledgment
              ? "rounded-md border border-slate-200 bg-slate-50 p-4"
              : "rounded-md border border-amber-300 bg-amber-50 p-4"
          }
        >
          <p className="text-sm font-medium text-slate-900">
            {conflictsAcknowledged && !needsAcknowledgment
              ? "Acknowledged offer conflicts"
              : "Review offer conflicts"}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {visibleConflicts.map((conflict) => (
              <li key={`${conflict.code}-${conflict.message}`}>
                {conflict.message}
              </li>
            ))}
          </ul>
          {needsAcknowledgment ? (
            <label className="mt-3 flex items-start gap-2 text-sm text-amber-950">
              <input
                type="checkbox"
                name="acknowledgeOfferConflicts"
                value="1"
                className="mt-0.5"
              />
              <span>
                Keep this offer anyway. I understand it differs from the
                current product claims or evidence.
              </span>
            </label>
          ) : null}
        </div>
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

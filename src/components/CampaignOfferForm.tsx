"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateCampaignOfferAction,
  type CampaignOfferActionResult,
} from "@/app/actions/campaign-offer";
import type { CampaignOfferFields } from "@/lib/campaign/offer-validation";
import { Field, PRIMARY_BUTTON_CLASS, SubmitButton } from "@/components/ui";
import { cn } from "@/lib/utils";

const initial: CampaignOfferActionResult | null = null;

export function CampaignOfferForm({
  campaignId,
  offer,
  showContinueToList = true,
}: {
  campaignId: string;
  offer: CampaignOfferFields;
  /** Setup offers the List-stage handoff after a successful save. */
  showContinueToList?: boolean;
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

      {showContinueToList && state?.ok ? (
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3"
          data-testid="campaign-offer-next-step"
        >
          <p className="text-sm font-medium text-emerald-950">
            Setup saved. Next: attach a list.
          </p>
          <p className="mt-1 text-sm text-emerald-900">
            An offer is optional. Continue to the List stage to research, score,
            and add contacts.
          </p>
          <Link
            href={`/campaigns/${campaignId}?stage=list`}
            className={cn(PRIMARY_BUTTON_CLASS, "mt-3")}
          >
            Continue to List
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Offer Name"
          name="offerName"
          defaultValue={values.offerName}
          hint="Optional. Not required to save or continue to List."
        />
        <Field
          label="Primary CTA"
          name="offerCta"
          defaultValue={values.offerCta}
          hint="Optional."
        />
        <div className="md:col-span-2">
          <Field
            label="Offer Description"
            name="offerDescription"
            as="textarea"
            defaultValue={values.offerDescription}
            hint="Optional. Used in email copy when present."
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Offer Notes"
            name="offerNotes"
            as="textarea"
            defaultValue={values.offerNotes}
            hint="Optional."
          />
        </div>
      </div>

      <SubmitButton disabled={pending}>
        {pending ? "Validating…" : "Save offer"}
      </SubmitButton>
    </form>
  );
}

function OfferReadOnly({ offer }: { offer: CampaignOfferFields }) {
  const rows: Array<{ label: string; value: string | null; wide?: boolean }> = [
    { label: "Offer Name", value: offer.offerName },
    { label: "Primary CTA", value: offer.offerCta },
    { label: "Offer Description", value: offer.offerDescription, wide: true },
    { label: "Offer Notes", value: offer.offerNotes, wide: true },
  ];

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className={row.wide ? "sm:col-span-2" : undefined}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {row.label}
          </dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-900">
            {row.value || "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CollapsibleCampaignOffer({
  campaignId,
  offer,
  readOnly = false,
}: {
  campaignId: string;
  offer: CampaignOfferFields;
  readOnly?: "archived" | "shared" | false;
}) {
  return (
    <details
      data-testid="emails-campaign-offer"
      className="rounded-md border border-slate-200 bg-white"
    >
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-800">
        Campaign offer
      </summary>
      <div className="border-t border-slate-200 px-3 py-3">
        <p className="mb-3 text-xs text-slate-600">
          Optional. Used in email copy when present.
        </p>
        {readOnly === "archived" ? (
          <p className="mb-3 text-sm text-slate-600">
            Offer settings are read-only while this campaign is archived.
          </p>
        ) : null}
        {readOnly === "shared" ? (
          <p className="mb-3 text-sm text-slate-600">
            Shared campaign template is read-only. Use this campaign from the
            campaign list to create a personal copy.
          </p>
        ) : null}
        {readOnly ? (
          <OfferReadOnly offer={offer} />
        ) : (
          <CampaignOfferForm
            campaignId={campaignId}
            offer={offer}
            showContinueToList={false}
          />
        )}
      </div>
    </details>
  );
}

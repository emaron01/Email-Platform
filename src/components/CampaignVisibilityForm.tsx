"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  setCampaignVisibilityAction,
  type CampaignSharingActionResult,
} from "@/app/actions/campaign-sharing";
import { SubmitButton } from "@/components/ui";

const initial: CampaignSharingActionResult | null = null;

export function CampaignVisibilityForm({
  campaignId,
  visibility,
}: {
  campaignId: string;
  visibility: "PERSONAL" | "SHARED";
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    setCampaignVisibilityAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      {state ? (
        <p
          role="status"
          className={
            state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      ) : null}
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">
          Campaign sharing
        </legend>
        <p className="mt-1 text-xs text-slate-500">
          Shared campaigns appear under All Campaigns. Teammates choose{" "}
          <span className="font-medium">Use this campaign</span> (run on this
          template) or <span className="font-medium">Duplicate as mine</span>{" "}
          (personal copy of the setup, empty of contacts).
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="visibility"
              value="PERSONAL"
              defaultChecked={visibility === "PERSONAL"}
            />
            Personal
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="visibility"
              value="SHARED"
              defaultChecked={visibility === "SHARED"}
            />
            Shared with organization
          </label>
        </div>
      </fieldset>
      <SubmitButton disabled={pending}>Save visibility</SubmitButton>
    </form>
  );
}

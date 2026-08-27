"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createProductMinimalAction,
  researchAndBuildProductAction,
  retryProductSynthesisAction,
  type ProductSetupActionResult,
} from "@/app/actions/product-setup";
import { Field, SecondaryButton, SubmitButton } from "@/components/ui";
import type {
  PersonaDraft,
  SuggestedBuyerRole,
  SuggestedPersona,
} from "@/lib/product-research/contract";

const initial: ProductSetupActionResult | null = null;

function Status({ result }: { result: ProductSetupActionResult | null }) {
  if (!result) return null;
  return (
    <p
      role="status"
      className={
        result.ok ? "mt-3 text-sm text-emerald-700" : "mt-3 text-sm text-red-600"
      }
    >
      {result.message}
    </p>
  );
}

export function AssistedProductIntake({
  productId,
  defaultName,
  defaultUrl,
  urlResearchStale,
  latestEvidenceBundleId,
}: {
  productId?: string;
  defaultName?: string;
  defaultUrl?: string;
  urlResearchStale?: boolean;
  latestEvidenceBundleId?: string | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    researchAndBuildProductAction,
    initial,
  );
  const [saveOnly, saveAction, savePending] = useActionState(
    createProductMinimalAction,
    initial,
  );
  const [retry, retryAction, retryPending] = useActionState(
    retryProductSynthesisAction,
    initial,
  );

  useEffect(() => {
    // Navigate to research page when evidence was preserved (success or synthesis failure).
    if (state?.productId && state.evidenceBundleId) {
      router.push(`/setup/${state.productId}/research`);
      router.refresh();
    }
  }, [state, router]);

  useEffect(() => {
    if (saveOnly?.ok && saveOnly.productId && !productId) {
      router.push(`/setup/${saveOnly.productId}/research`);
      router.refresh();
    }
  }, [saveOnly, productId, router]);

  return (
    <div className="space-y-6" data-testid="assisted-product-intake">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">
          Tell us what you sell
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Start with the materials you already use — datasheets, whitepapers,
          decks, or use cases. Product name is required; everything else is
          optional. We draft your Product and Personas once for your review.
        </p>
      </div>

      <form action={action} className="grid gap-4 md:grid-cols-2" encType="multipart/form-data">
        {productId ? (
          <input type="hidden" name="productId" value={productId} />
        ) : null}
        <div className="md:col-span-2">
          <Field
            label="Product Name"
            name="name"
            required
            defaultValue={defaultName}
          />
        </div>

        <div className="md:col-span-2 space-y-3">
          <label className="flex cursor-pointer flex-col rounded-lg border border-slate-900 bg-slate-900 p-5 text-white transition hover:bg-slate-800">
            <span className="text-base font-semibold">Upload materials</span>
            <span className="mt-1 text-sm text-white/80">
              Datasheets, whitepapers, decks, use cases, or product overviews.
              PDF, DOCX, TXT, MD · Max 15 MiB each.
            </span>
            <input
              type="file"
              name="files"
              multiple
              accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
              className="mt-4 block w-full text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-900"
              data-testid="product-upload-materials"
            />
          </label>

          <div className="rounded-lg border border-slate-300 bg-white p-5">
            <label className="block" htmlFor="pastedContent">
              <span className="text-base font-semibold text-slate-900">
                Paste product content
              </span>
              <span className="mt-1 block text-sm text-slate-500">
                Paste from a brochure, whitepaper, sales deck, datasheet,
                product sheet, or case study.
              </span>
            </label>
            <textarea
              id="pastedContent"
              name="pastedContent"
              rows={8}
              placeholder="Paste product content here…"
              className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2"
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <Field
            label="Product Notes"
            name="notes"
            as="textarea"
            hint="Anything important about the buyer, positioning, pricing, use case, or market that is not in the materials above."
          />
        </div>

        <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-sm text-slate-600">
            Many product pages cannot be read automatically — they load content
            with JavaScript or block automated access. Uploading or pasting the
            materials you already have usually produces a better profile than a
            website link alone.
          </p>
          <Field
            label="Product URL (optional)"
            name="primaryUrl"
            defaultValue={defaultUrl}
            placeholder="https://"
            hint="A product or solution page can help, but it is not required."
          />
          <Field
            label="Additional URLs (optional)"
            name="additionalUrls"
            as="textarea"
            rows={2}
            placeholder="One URL per line"
            hint="Pricing, features, or case-study pages if you have them."
          />
          {urlResearchStale ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Website research is past the freshness window. Check “Refresh
              website research” to reacquire URLs (explicit action).
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" name="forceUrlRefresh" value="1" />
                Refresh website research
              </label>
            </div>
          ) : null}
        </div>

        <div className="md:col-span-2 flex flex-wrap gap-2">
          <SubmitButton disabled={pending || savePending || retryPending}>
            {pending ? "Researching…" : "Research & Build Product"}
          </SubmitButton>
          {!productId ? (
            <button
              type="submit"
              formAction={saveAction}
              disabled={pending || savePending}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
            >
              {savePending ? "Saving…" : "Save Product only"}
            </button>
          ) : null}
        </div>
      </form>
      <Status result={state ?? saveOnly} />

      {productId && latestEvidenceBundleId ? (
        <form action={retryAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="productId" value={productId} />
          <input
            type="hidden"
            name="evidenceBundleId"
            value={latestEvidenceBundleId}
          />
          <SecondaryButton type="submit" disabled={retryPending}>
            {retryPending ? "Retrying synthesis…" : "Retry Synthesis"}
          </SecondaryButton>
          <Status result={retry} />
        </form>
      ) : null}
    </div>
  );
}

export { ProductDraftReview } from "@/components/ProductDraftReview";

export function SuggestedBuyerRolesPanel({
  productId,
  productApproved,
  roles,
}: {
  productId: string;
  productApproved: boolean;
  roles: SuggestedBuyerRole[];
}) {
  if (!productApproved) {
    return (
      <div
        className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
        data-testid="suggested-buyer-roles-locked"
      >
        Save and approve the Product first. Suggested buyer roles become
        available for building Personas after Product approval.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="suggested-buyer-roles">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">
          Suggested Buyer Roles
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Recommendations only — not Personas yet. Build one Persona at a time.
          Unused roles incur no Persona research or synthesis cost.
        </p>
      </div>
      {roles.length === 0 ? (
        <p className="text-sm text-slate-500">
          No suggested roles from Product synthesis. You can still create a
          custom Persona.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.map((role) => (
            <div
              key={role.suggestionKey}
              className="rounded-md border border-slate-200 bg-white p-4"
            >
              <p className="font-medium text-slate-900">{role.name}</p>
              {role.whyThisRoleMatters ? (
                <p className="mt-2 text-sm text-slate-600">
                  {role.whyThisRoleMatters}
                </p>
              ) : null}
              {role.likelyTitles.length > 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Likely titles: {role.likelyTitles.join(", ")}
                </p>
              ) : null}
              <p className="mt-3">
                <Link
                  href={`/setup/${productId}/personas/new?role=${encodeURIComponent(role.suggestionKey)}`}
                  className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Build Persona
                </Link>
              </p>
            </div>
          ))}
        </div>
      )}
      <p className="text-sm">
        <Link
          href={`/setup/${productId}/personas/new`}
          className="font-medium text-slate-800 underline"
        >
          Create Custom Persona
        </Link>
        {" · "}
        <Link href={`/setup/${productId}`} className="underline">
          Product ICPs & Personas
        </Link>
      </p>
    </div>
  );
}

/** @deprecated legacy combined draft UI — prefer SuggestedBuyerRolesPanel */
export function SuggestedPersonasPanel({
  productId,
  setupRunId: _setupRunId,
  suggestions,
  drafts: _drafts,
}: {
  productId: string;
  setupRunId: string;
  suggestions: SuggestedPersona[];
  drafts: PersonaDraft[];
}) {
  const roles: SuggestedBuyerRole[] = suggestions.map((s) => ({
    suggestionKey: s.suggestionKey,
    name: s.name,
    likelyTitles: s.likelyTitles ?? [],
    departmentFunction: s.departmentFunction ?? s.department ?? null,
    whyThisRoleMatters: s.whyThisRoleMatters ?? s.whyThisPersonaMatters ?? null,
    confidence: s.confidence ?? "MEDIUM",
    evidenceRefs: s.evidenceRefs ?? [],
  }));
  return (
    <SuggestedBuyerRolesPanel
      productId={productId}
      productApproved
      roles={roles}
    />
  );
}

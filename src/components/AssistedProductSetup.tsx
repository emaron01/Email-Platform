"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createProductMinimalAction,
  researchAndBuildProductAction,
  retryProductSynthesisAction,
  saveApprovedProductAction,
  type ProductSetupActionResult,
} from "@/app/actions/product-setup";
import { Field, SecondaryButton, SubmitButton } from "@/components/ui";
import type {
  PersonaDraft,
  ProductDraft,
  ProductMessagingDraft,
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
          Product name is required. Everything else is optional. We acquire
          evidence once and draft your Product and Personas for your review.
        </p>
      </div>

      <form action={action} className="grid gap-4 md:grid-cols-2" encType="multipart/form-data">
        {productId ? (
          <input type="hidden" name="productId" value={productId} />
        ) : null}
        <Field
          label="Product Name"
          name="name"
          required
          defaultValue={defaultName}
        />
        <Field
          label="Primary Product URL"
          name="primaryUrl"
          defaultValue={defaultUrl}
          placeholder="https://"
          hint="Product page, solution page, or company page that best explains what you sell."
        />
        <div className="md:col-span-2">
          <Field
            label="Additional Source URLs"
            name="additionalUrls"
            as="textarea"
            rows={2}
            placeholder="One URL per line (pricing, features, case studies…)"
            hint="Optional. Separate URLs with new lines."
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Product Notes"
            name="notes"
            as="textarea"
            hint="Tell us anything important about the product, buyer, positioning, pricing, use case, or market."
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Paste Product Content"
            name="pastedContent"
            as="textarea"
            rows={5}
            hint="Paste content from a brochure, whitepaper, sales deck, product sheet, website, battlecard, or case study."
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Upload Product Materials
            </span>
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              PDF, DOCX, TXT, MD. Max 15 MiB each.
            </span>
            <input
              type="file"
              name="files"
              multiple
              accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
              className="mt-1 block w-full text-sm text-slate-600"
            />
          </label>
        </div>
        {urlResearchStale ? (
          <div className="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Website research is past the freshness window. Check “Refresh
            website research” to reacquire URLs (explicit action).
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" name="forceUrlRefresh" value="1" />
              Refresh website research
            </label>
          </div>
        ) : null}
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

export function ProductDraftReview({
  productId,
  setupRunId,
  productName,
  websiteUrl,
  sourceCount,
  draft,
  messaging,
}: {
  productId: string;
  setupRunId: string;
  productName: string;
  websiteUrl: string | null;
  sourceCount: number;
  draft: ProductDraft;
  messaging: ProductMessagingDraft | null;
}) {
  const [state, action, pending] = useActionState(
    saveApprovedProductAction,
    initial,
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-4" data-testid="product-draft-review">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">
          Review Your Product Profile
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Generated from {sourceCount} source{sourceCount === 1 ? "" : "s"}.
          Edit anything, then Save — saving validates this as authoritative.
        </p>
      </div>
      <form action={action} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="setupRunId" value={setupRunId} />
        <Field label="Product Name" name="name" defaultValue={productName} required />
        <Field
          label="Website URL"
          name="websiteUrl"
          defaultValue={websiteUrl}
        />
        <div className="md:col-span-2">
          <Field
            label="Description"
            name="description"
            as="textarea"
            defaultValue={draft.description ?? ""}
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Primary Value Proposition"
            name="valueProposition"
            as="textarea"
            defaultValue={draft.valueProposition ?? ""}
          />
        </div>
        {draft.unknownFields?.length ? (
          <p className="md:col-span-2 text-sm text-slate-500">
            Left unknown (not fabricated): {draft.unknownFields.join(", ")}
          </p>
        ) : null}
        {messaging?.primaryPositioning ? (
          <p className="md:col-span-2 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            <span className="font-medium">Messaging (guidance only): </span>
            {messaging.primaryPositioning}
          </p>
        ) : null}
        {draft.evidenceRefs && draft.evidenceRefs.length > 0 ? (
          <details className="md:col-span-2 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-800">
              Why did AI suggest this?
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {draft.evidenceRefs.slice(0, 12).map((ref, i) => (
                <li key={i}>
                  {ref.claim}
                  {ref.sourceIds?.length
                    ? ` (sources: ${ref.sourceIds.join(", ")})`
                    : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="md:col-span-2">
          <SubmitButton disabled={pending}>
            {pending ? "Saving…" : "Review & Save Product"}
          </SubmitButton>
        </div>
      </form>
      <Status result={state} />
    </div>
  );
}

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

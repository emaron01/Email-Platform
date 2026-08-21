"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createProductMinimalAction,
  researchAndBuildProductAction,
  retryProductSynthesisAction,
  saveApprovedPersonaFromSuggestionAction,
  saveApprovedProductAction,
  type ProductSetupActionResult,
} from "@/app/actions/product-setup";
import { Field, SecondaryButton, SubmitButton } from "@/components/ui";
import type {
  PersonaDraft,
  ProductDraft,
  ProductMessagingDraft,
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
    if (state?.ok && state.productId) {
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
            {retryPending
              ? "Retrying synthesis…"
              : "Retry AI synthesis (reuse evidence)"}
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

export function SuggestedPersonasPanel({
  productId,
  setupRunId,
  suggestions,
  drafts,
}: {
  productId: string;
  setupRunId: string;
  suggestions: SuggestedPersona[];
  drafts: PersonaDraft[];
}) {
  if (suggestions.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No suggested personas from this run. You can still add Personas
        manually on the product page.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="suggested-personas">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">
          Suggested Buyer Personas
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Drafts from the same product evidence. Add & save to make a Persona
          authoritative — no extra website research.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {suggestions.map((s) => {
          const draft =
            drafts.find((d) => d.suggestionKey === s.suggestionKey) ?? null;
          return (
            <PersonaSuggestionCard
              key={s.suggestionKey}
              productId={productId}
              setupRunId={setupRunId}
              suggestion={s}
              draft={draft}
            />
          );
        })}
      </div>
      <p className="text-sm">
        <Link href={`/setup/${productId}`} className="underline">
          Back to Product ICPs & Personas
        </Link>
      </p>
    </div>
  );
}

function PersonaSuggestionCard({
  productId,
  setupRunId,
  suggestion,
  draft,
}: {
  productId: string;
  setupRunId: string;
  suggestion: SuggestedPersona;
  draft: PersonaDraft | null;
}) {
  const [state, action, pending] = useActionState(
    saveApprovedPersonaFromSuggestionAction,
    initial,
  );
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="font-medium text-slate-900">{suggestion.name}</p>
      <p className="mt-1 text-xs text-slate-500">
        Confidence: {suggestion.confidence}
        {suggestion.department ? ` · ${suggestion.department}` : ""}
        {suggestion.seniority ? ` · ${suggestion.seniority}` : ""}
      </p>
      {suggestion.whyThisPersonaMatters ? (
        <p className="mt-2 text-sm text-slate-600">
          {suggestion.whyThisPersonaMatters}
        </p>
      ) : null}
      {suggestion.evidenceSummary ? (
        <p className="mt-1 text-xs text-slate-500">{suggestion.evidenceSummary}</p>
      ) : null}
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="setupRunId" value={setupRunId} />
        <input type="hidden" name="suggestionKey" value={suggestion.suggestionKey} />
        <Field
          label="Persona Name"
          name="name"
          defaultValue={draft?.name ?? suggestion.name}
          required
        />
        <Field
          label="Likely Titles"
          name="targetTitles"
          defaultValue={(draft?.likelyTitles ?? suggestion.likelyTitles).join(
            ", ",
          )}
        />
        <Field
          label="Department / Function"
          name="department"
          defaultValue={draft?.department ?? suggestion.department ?? ""}
        />
        <Field
          label="Seniority"
          name="seniority"
          defaultValue={draft?.seniority ?? suggestion.seniority ?? ""}
        />
        <Field
          label="Describe the person"
          name="definition"
          as="textarea"
          defaultValue={draft?.definition ?? ""}
        />
        <Field
          label="Primary Responsibilities"
          name="responsibilities"
          as="textarea"
          defaultValue={(draft?.responsibilities ?? []).join("\n")}
        />
        <Field
          label="Problems / Pain Points"
          name="painPoints"
          as="textarea"
          defaultValue={(draft?.painPoints ?? []).join("\n")}
        />
        <Field
          label="Desired Outcomes From Your Solution"
          name="desiredOutcomes"
          as="textarea"
          defaultValue={(
            draft?.desiredOutcomesFromYourSolution ?? []
          ).join("\n")}
          hint="Business outcomes — not campaign CTAs."
        />
        <Field
          label="Messaging Notes"
          name="messagingNotes"
          as="textarea"
          defaultValue={draft?.messagingNotes ?? ""}
          hint="Persona messaging guidance — not scoring evidence."
        />
        <SubmitButton disabled={pending}>
          {pending ? "Saving…" : "Review & Save Persona"}
        </SubmitButton>
      </form>
      <Status result={state} />
    </div>
  );
}

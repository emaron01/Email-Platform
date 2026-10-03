"use client";

import Link from "next/link";
import { Fragment, useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createCampaignAction } from "@/app/actions";
import { makePrimaryCriterionMandatoryAndRescoreAction } from "@/app/actions/scoring";
import {
  bulkRestoreQualificationAction,
  overrideQualificationBucketAction,
} from "@/app/actions/qualification";
import {
  DEFAULT_EMAIL_LENGTH,
  EMAIL_GUIDANCE_MAX_CHARS,
  EMAIL_LENGTH_OPTIONS,
  type CampaignActionResult,
} from "@/lib/campaign/save";
import {
  Field,
  PrimaryButton,
  SecondaryButton,
  SECONDARY_BUTTON_CLASS,
  SubmitButton,
} from "@/components/ui";
import { contactDisplayName, cn } from "@/lib/utils";
import { ExclusionDetailList } from "@/components/ExclusionDetailList";
import {
  companyResearchLabel,
  displayQualificationBucket,
  qualificationBadgeClass,
  resolveQualification,
  ScoreDetailPanel,
  type ScoreReportClientRow,
} from "@/components/ScoreDetailPanel";
import { EmailGuidancePromptExamples } from "@/components/EmailGuidancePromptExamples";
import {
  groupExclusionDetailsByCriterion,
  readExclusionDetails,
} from "@/lib/scoring/exclusion-detail";
import {
  EXCLUSION_REVIEW_COPY,
  readPersonaMatch,
} from "@/lib/workflow/qualification";
import type { QualificationBucket } from "@prisma/client";

export type { ScoreReportClientRow } from "@/components/ScoreDetailPanel";

export type MandatorySuggestionView = {
  criterionId: string;
  criterionName: string;
  failedCompanyCount: number;
  prompt: string;
};

export function ScoreReportClient({
  runId,
  productId,
  icpId,
  personaId,
  productName,
  icpName,
  personaName,
  personas: _personas = [],
  rows,
  mandatorySuggestions = [],
  readOnly = false,
}: {
  runId: string;
  productId: string;
  icpId: string;
  personaId: string | null;
  productName: string;
  icpName: string;
  personaName: string;
  personas?: Array<{ id: string; name: string }>;
  rows: ScoreReportClientRow[];
  mandatorySuggestions?: MandatorySuggestionView[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCampaign, setShowCampaign] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);
  const [overridePending, setOverridePending] = useState(false);
  const [restoredBuckets, setRestoredBuckets] = useState<
    Record<string, QualificationBucket>
  >({});
  const [keptExcludedIds, setKeptExcludedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [campaignState, campaignAction, campaignPending] = useActionState(
    createCampaignAction,
    null as CampaignActionResult | null,
  );
  const [mandatoryState, mandatoryAction, mandatoryPending] = useActionState(
    makePrimaryCriterionMandatoryAndRescoreAction,
    null as { ok: boolean; message: string } | null,
  );

  useEffect(() => {
    if (!mandatoryState?.ok) return;
    router.refresh();
  }, [mandatoryState, router]);

  useEffect(() => {
    if (!campaignState?.ok) return;
    setShowCampaign(false);
    router.push(
      campaignState.campaignId
        ? `/campaigns/${campaignState.campaignId}`
        : "/campaigns",
    );
    router.refresh();
  }, [campaignState, router]);

  const visibleIds = useMemo(() => rows.map((row) => row.contactId), [rows]);

  const exclusionGroups = useMemo(
    () =>
      groupExclusionDetailsByCriterion(
        rows
          .map((row) => {
            const bucket =
              restoredBuckets[row.contactId] ??
              resolveQualification(row).bucket;
            if (bucket !== "EXCLUDED") return null;
            if (keptExcludedIds.has(row.contactId)) return null;
            const details = readExclusionDetails(row.assessmentData);
            if (details.length === 0) return null;
            return { contactId: row.contactId, details };
          })
          .filter(
            (row): row is { contactId: string; details: ReturnType<typeof readExclusionDetails> } =>
              row != null,
          ),
      ),
    [rows, restoredBuckets, keptExcludedIds],
  );

  const exclusionContactCount = useMemo(() => {
    const ids = new Set<string>();
    for (const group of exclusionGroups) {
      for (const id of group.contactIds) ids.add(id);
    }
    return ids.size;
  }, [exclusionGroups]);

  function keepExcluded(contactId: string) {
    if (readOnly) return;
    setKeptExcludedIds((current) => new Set(current).add(contactId));
  }

  function keepExcludedMany(contactIds: string[]) {
    if (readOnly) return;
    setKeptExcludedIds((current) => {
      const next = new Set(current);
      for (const id of contactIds) next.add(id);
      return next;
    });
  }

  async function restoreContact(contactId: string, bucket: QualificationBucket = "GOOD") {
    if (readOnly) return;
    setOverridePending(true);
    setOverrideMessage(null);
    const result = await overrideQualificationBucketAction({
      scoringRunId: runId,
      targetType: "CONTACT",
      targetId: contactId,
      bucket,
    });
    setOverridePending(false);
    setOverrideMessage(result.message);
    if (result.ok && result.bucket) {
      setRestoredBuckets((current) => ({
        ...current,
        [contactId]: result.bucket!,
      }));
      router.refresh();
    }
  }

  async function restoreGroup(contactIds: string[], bucket: QualificationBucket = "GOOD") {
    if (readOnly) return;
    setOverridePending(true);
    setOverrideMessage(null);
    const result = await bulkRestoreQualificationAction({
      scoringRunId: runId,
      targetType: "CONTACT",
      targetIds: contactIds,
      bucket,
    });
    setOverridePending(false);
    setOverrideMessage(result.message);
    if (result.ok && result.bucket) {
      setRestoredBuckets((current) => {
        const next = { ...current };
        for (const contactId of contactIds) {
          next[contactId] = result.bucket!;
        }
        return next;
      });
      router.refresh();
    }
  }

  function toggleOne(contactId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  function selectAllVisible() {
    if (readOnly) return;
    setSelected(new Set(visibleIds));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function submitCampaign(formData: FormData) {
    if (readOnly) return;
    for (const contactId of selected) {
      formData.append("contactIds", contactId);
    }
    return campaignAction(formData);
  }

  return (
    <div className="space-y-4">
      {mandatorySuggestions.length > 0 ? (
        <div className="space-y-2" data-testid="mandatory-suggestions">
          {mandatorySuggestions.map((suggestion) => (
            <form
              key={suggestion.criterionId}
              action={mandatoryAction}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
            >
              <input type="hidden" name="scoringRunId" value={runId} />
              <input
                type="hidden"
                name="criterionId"
                value={suggestion.criterionId}
              />
              <p>{suggestion.prompt}</p>
              <PrimaryButton
                type="submit"
                disabled={mandatoryPending}
              >
                Make mandatory
              </PrimaryButton>
            </form>
          ))}
          {mandatoryState && !mandatoryState.ok ? (
            <p role="status" className="text-sm text-rose-800">
              {mandatoryState.message}
            </p>
          ) : null}
        </div>
      ) : null}
      {exclusionGroups.length > 0 ? (
        <div className="space-y-4" data-testid="bulk-exclusion-restore">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {EXCLUSION_REVIEW_COPY.panelHeading(exclusionContactCount)}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {EXCLUSION_REVIEW_COPY.panelSubheading}
            </p>
          </div>
          {exclusionGroups.map((group) => {
            const contacts = group.contactIds
              .map((contactId) => rows.find((row) => row.contactId === contactId))
              .filter((row): row is ScoreReportClientRow => row != null);
            return (
              <div
                key={group.key}
                className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">
                    {EXCLUSION_REVIEW_COPY.groupReason(group.criterionName)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <SecondaryButton
                      type="button"
                      disabled={overridePending}
                      onClick={() => keepExcludedMany(group.contactIds)}
                    >
                      {EXCLUSION_REVIEW_COPY.keepExcluded}
                    </SecondaryButton>
                    <SecondaryButton
                      type="button"
                      disabled={overridePending}
                      onClick={() => restoreGroup(group.contactIds, "GOOD")}
                    >
                      {EXCLUSION_REVIEW_COPY.addAllBack}
                    </SecondaryButton>
                  </div>
                </div>
                <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
                  {contacts.map((row) => {
                    const name = contactDisplayName(
                      row.contact.firstName,
                      row.contact.lastName,
                    );
                    const title = row.contact.title?.trim() || null;
                    const company =
                      row.contact.companyRecord?.name?.trim() ||
                      row.contact.company?.trim() ||
                      null;
                    return (
                      <li
                        key={row.contactId}
                        className="flex flex-wrap items-start justify-between gap-2 px-3 py-2"
                      >
                        <div>
                          <p className="font-medium text-slate-900">{name}</p>
                          <p className="text-xs text-slate-600">
                            {[title, company].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <SecondaryButton
                            type="button"
                            disabled={overridePending}
                            onClick={() => keepExcluded(row.contactId)}
                          >
                            {EXCLUSION_REVIEW_COPY.keepExcluded}
                          </SecondaryButton>
                          <SecondaryButton
                            type="button"
                            disabled={overridePending}
                            onClick={() =>
                              restoreContact(row.contactId, "GOOD")
                            }
                          >
                            {EXCLUSION_REVIEW_COPY.addBack}
                          </SecondaryButton>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
      {overrideMessage ? (
        <p role="status" className="text-sm text-slate-700">
          {overrideMessage}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <p className="text-sm text-slate-600">
          Selected: <strong className="text-slate-900">{selected.size}</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={selectAllVisible}>
            Select all visible
          </SecondaryButton>
          <SecondaryButton onClick={clearSelection}>
            Clear selection
          </SecondaryButton>
          <PrimaryButton
            disabled={selected.size === 0}
            onClick={() => setShowCampaign(true)}
          >
            Create Campaign From Selected
          </PrimaryButton>
        </div>
      </div>

      <div className="max-h-[75vh] overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-[1200px] table-fixed divide-y divide-slate-200 text-sm">
          <colgroup>
            <col className="w-14" />
            <col className="w-48" />
            <col className="w-44" />
            <col className="w-40" />
            <col className="w-28" />
            <col className="w-32" />
            <col className="w-80" />
            <col className="w-20" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)]">
            <tr>
              <th className="px-3 py-3 font-medium">Select</th>
              <th className="px-3 py-3 font-medium">Contact</th>
              <th className="px-3 py-3 font-medium">Title</th>
              <th className="px-3 py-3 font-medium">Company</th>
              <th className="px-3 py-3 font-medium">Research</th>
              <th className="px-3 py-3 font-medium">Qualification</th>
              <th className="px-3 py-3 font-medium">Reason</th>
              <th className="px-3 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const open = expandedId === row.id;
              const companyResearch = row.contact.companyRecord?.research?.[0];
              const personaMatch = readPersonaMatch(row.assessmentData);
              const resolvedQualification = resolveQualification(row);
              const effectiveBucket =
                restoredBuckets[row.contactId] ?? resolvedQualification.bucket;
              const exclusionDetails = readExclusionDetails(row.assessmentData);
              const isExcluded = effectiveBucket === "EXCLUDED";
              const canRestore =
                isExcluded &&
                !row.suppressed &&
                row.scoringStatus !== "SUPPRESSED";
              const researchLabel = companyResearchLabel(
                companyResearch,
              );
              return (
                <Fragment key={row.id}>
                  <tr className="align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(row.contactId)}
                        disabled={
                          readOnly ||
                          row.suppressed ||
                          row.scoringStatus === "SUPPRESSED" ||
                          row.scoringStatus === "UNUSABLE"
                        }
                        onChange={() => toggleOne(row.contactId)}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {contactDisplayName(
                        row.contact.firstName,
                        row.contact.lastName,
                      )}
                      <div className="text-xs font-normal text-slate-500">
                        {row.contact.email ?? (
                          <span className="text-slate-500">No email — unusable</span>
                        )}
                        {row.scoringStatus === "UNUSABLE" ? (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                            Unusable
                          </span>
                        ) : null}
                        {row.suppressed || row.scoringStatus === "SUPPRESSED" ? (
                          <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                            Opted out
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.contact.title ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.contact.companyId ? (
                        <Link
                          href={`/companies/${row.contact.companyId}`}
                          className="underline"
                        >
                          {row.contact.company ??
                            row.contact.companyRecord?.name ??
                            "Company"}
                        </Link>
                      ) : (
                        (row.contact.company ?? "—")
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      Research: {researchLabel}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                          qualificationBadgeClass(effectiveBucket),
                        )}
                      >
                        {displayQualificationBucket(effectiveBucket)}
                      </span>
                      {canRestore ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={overridePending}
                            onClick={() => restoreContact(row.contactId, "GOOD")}
                            className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900"
                            data-testid={`restore-contact-${row.contactId}`}
                          >
                            {EXCLUSION_REVIEW_COPY.addBack}
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {isExcluded && exclusionDetails.length > 0 ? (
                        <ExclusionDetailList details={exclusionDetails} compact />
                      ) : (
                        <button
                          type="button"
                          className={cn(
                            SECONDARY_BUTTON_CLASS,
                            "w-full !px-2 !py-1.5 text-left",
                          )}
                          title={resolvedQualification.reason ?? "Pending"}
                          aria-expanded={open}
                          onClick={() => setExpandedId(open ? null : row.id)}
                        >
                          <span className="line-clamp-2 leading-5">
                            {resolvedQualification.reason ?? "Pending"}
                          </span>
                          <span className="mt-0.5 block text-xs font-medium text-slate-500">
                            {open ? "Hide details" : "Show details"}
                          </span>
                        </button>
                      )}
                      {personaMatch?.matchedPersonaId ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Persona matched
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-sm font-medium text-slate-900 underline"
                        onClick={() => setExpandedId(open ? null : row.id)}
                      >
                        {open ? "Hide" : "View"}
                      </button>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="bg-slate-50">
                      <td colSpan={8} className="px-4 py-4">
                        <ScoreDetailPanel row={row} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {showCampaign ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
          <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Create Campaign From Selected
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {selected.size} contact
                  {selected.size === 1 ? "" : "s"} · {productName} · {icpName} ·{" "}
                  {personaName}
                </p>
              </div>
              <SecondaryButton onClick={() => setShowCampaign(false)}>
                Close
              </SecondaryButton>
            </div>
            <form action={submitCampaign} className="space-y-4 px-5 py-5">
              {campaignState && !campaignState.ok ? (
                <p
                  role="status"
                  data-testid="campaign-action-status"
                  className="text-sm text-red-600"
                >
                  {campaignState.message}
                </p>
              ) : null}
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="icpId" value={icpId} />
              {personaId ? (
                <>
                  <input type="hidden" name="personaId" value={personaId} />
                  <input type="hidden" name="personaIds" value={personaId} />
                </>
              ) : (
                <input type="hidden" name="allPersonas" value="1" />
              )}
              <Field label="Campaign Name" name="name" required />
              <Field
                label="Offer Name"
                name="offerName"
                placeholder="Free Forecast Audit"
              />
              <Field
                label="Primary CTA"
                name="offerCta"
                placeholder="Book a demo"
              />
              <Field
                label="Offer Description"
                name="offerDescription"
                as="textarea"
              />
              <Field label="Offer Notes" name="offerNotes" as="textarea" />
              <fieldset>
                <legend className="text-sm font-medium text-slate-700">
                  Email length
                </legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {EMAIL_LENGTH_OPTIONS.map((value) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                    >
                      <input
                        type="radio"
                        name="emailLength"
                        value={value}
                        defaultChecked={
                          (campaignState && !campaignState.ok
                            ? campaignState.values?.emailLength
                            : DEFAULT_EMAIL_LENGTH) === value
                        }
                      />
                      {value === "SHORT"
                        ? "Short"
                        : value === "MEDIUM"
                          ? "Medium"
                          : "Long"}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">
                    Email guidance
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Steers every generated email in this campaign, up to{" "}
                    {EMAIL_GUIDANCE_MAX_CHARS} characters.
                  </span>
                  <textarea
                    name="emailGuidance"
                    rows={3}
                    maxLength={EMAIL_GUIDANCE_MAX_CHARS}
                    defaultValue={
                      campaignState && !campaignState.ok
                        ? campaignState.values?.emailGuidance
                        : undefined
                    }
                    placeholder="Focus on the feature that removes the most manual work"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2"
                  />
                </label>
                <EmailGuidancePromptExamples />
              </div>
              <div className="flex gap-2">
                <SubmitButton disabled={campaignPending}>
                  {campaignPending ? "Creating…" : "Create campaign"}
                </SubmitButton>
                <SecondaryButton
                  type="button"
                  onClick={() => setShowCampaign(false)}
                >
                  Cancel
                </SecondaryButton>
              </div>
              <p className="text-xs text-slate-500">
                Scoring run {runId} context is preserved via Product / ICP /
                Persona selection. Emails are not generated in this phase.
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

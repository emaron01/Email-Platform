"use client";

import Link from "next/link";
import { Fragment, useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createCampaignAction } from "@/app/actions";
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
  SubmitButton,
} from "@/components/ui";
import { contactDisplayName, cn } from "@/lib/utils";

export type CompanyResearchView = {
  id: string;
  status: string;
  researchMethod: string;
  researchConfidence: string | null;
  companySummary: string | null;
  whatTheySell: string | null;
  estimatedAov: string | null;
  aovReasoning: string | null;
  customerTypes: unknown;
  primaryMarkets: unknown;
  businessModel: string | null;
  companySizeContext: string | null;
  relevantTechnologies: unknown;
  buyingSignals: unknown;
  riskSignals: unknown;
  researchSources: unknown;
  researchedAt: string | null;
};

export type ScoreReportClientRow = {
  id: string;
  contactId: string;
  overallScore: number | null;
  icpScore: number | null;
  personaScore: number | null;
  companyScore: number | null;
  productRelevanceScore: number | null;
  scoreLabel: string | null;
  recommendedAction: string | null;
  companySummary: string | null;
  whatTheySell: string | null;
  estimatedAov: string | null;
  aovReasoning: string | null;
  fitStrengths: unknown;
  fitRisks: unknown;
  disqualifiers: unknown;
  reasoning: string | null;
  researchStatus: string;
  researchSources: unknown;
  scoringStatus: string;
  assessmentData: unknown;
  aiProvider: string | null;
  aiModel: string | null;
  aiModelUrlIdentifier: string | null;
  promptVersion: string | null;
  scoringLogicVersion: string | null;
  scoredAt: string | null;
  scoringError: string | null;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    title: string | null;
    company: string | null;
    companyId: string | null;
    companyRecord: {
      id: string;
      name: string;
      website: string | null;
      normalizedDomain: string | null;
      research: CompanyResearchView[];
    } | null;
  };
};

function displayScore(value: number | null): string {
  return value == null ? "Not scored" : String(value);
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function asDisqualifierList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const row = item as {
          criterion?: string;
          matchedIcpSignal?: string;
          evidence?: string[];
        };
        const base = row.criterion || row.matchedIcpSignal;
        if (!base) return "";
        const evidence =
          Array.isArray(row.evidence) && row.evidence.length
            ? ` — ${row.evidence.join("; ")}`
            : "";
        return `${base}${evidence}`;
      }
      return "";
    })
    .filter(Boolean);
}

type DimensionView = {
  dimension: string;
  assessment: string;
  confidence: string;
  evidence: string[];
  concerns: string[];
};

function asDimensions(assessmentData: unknown): DimensionView[] {
  if (!assessmentData || typeof assessmentData !== "object") return [];
  const dims = (assessmentData as { dimensions?: unknown }).dimensions;
  if (!Array.isArray(dims)) return [];
  return dims
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      return {
        dimension: String(row.dimension ?? ""),
        assessment: String(row.assessment ?? ""),
        confidence: String(row.confidence ?? ""),
        evidence: asStringList(row.evidence),
        concerns: asStringList(row.concerns),
      };
    })
    .filter((d): d is DimensionView => Boolean(d?.dimension));
}

function companyResearchLabel(status: string | null | undefined): string {
  switch (status) {
    case "COMPLETED":
      return "Complete";
    case "PARTIAL":
      return "Partial";
    case "FAILED":
      return "Failed";
    case "IN_PROGRESS":
      return "In progress";
    case "NOT_STARTED":
    default:
      return "Not Started";
  }
}

export function ScoreReportClient({
  runId,
  productId,
  icpId,
  personaId,
  productName,
  icpName,
  personaName,
  rows,
}: {
  runId: string;
  productId: string;
  icpId: string;
  personaId: string;
  productName: string;
  icpName: string;
  personaName: string;
  rows: ScoreReportClientRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCampaign, setShowCampaign] = useState(false);
  const [campaignState, campaignAction, campaignPending] = useActionState(
    createCampaignAction,
    null as CampaignActionResult | null,
  );

  useEffect(() => {
    if (!campaignState?.ok) return;
    setShowCampaign(false);
    router.push("/campaigns");
    router.refresh();
  }, [campaignState, router]);

  const visibleIds = useMemo(() => rows.map((row) => row.contactId), [rows]);

  function toggleOne(contactId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(visibleIds));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function submitCampaign(formData: FormData) {
    for (const contactId of selected) {
      formData.append("contactIds", contactId);
    }
    return campaignAction(formData);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <p className="text-sm text-slate-600">
          Selected: <strong className="text-slate-900">{selected.size}</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={selectAllVisible}>
            Select all visible
          </SecondaryButton>
          <SecondaryButton onClick={clearSelection}>Clear selection</SecondaryButton>
          <PrimaryButton
            disabled={selected.size === 0}
            onClick={() => setShowCampaign(true)}
          >
            Create Campaign From Selected
          </PrimaryButton>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-3 font-medium">Select</th>
              <th className="px-3 py-3 font-medium">Contact</th>
              <th className="px-3 py-3 font-medium">Title</th>
              <th className="px-3 py-3 font-medium">Company</th>
              <th className="px-3 py-3 font-medium">Research</th>
              <th className="px-3 py-3 font-medium">Overall</th>
              <th className="px-3 py-3 font-medium">ICP</th>
              <th className="px-3 py-3 font-medium">Persona</th>
              <th className="px-3 py-3 font-medium">Company Fit</th>
              <th className="px-3 py-3 font-medium">Product</th>
              <th className="px-3 py-3 font-medium">Label</th>
              <th className="px-3 py-3 font-medium">Action</th>
              <th className="px-3 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const open = expandedId === row.id;
              const companyResearch = row.contact.companyRecord?.research?.[0];
              const researchLabel = companyResearchLabel(companyResearch?.status);
              return (
                <Fragment key={row.id}>
                  <tr className="align-top">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(row.contactId)}
                        onChange={() => toggleOne(row.contactId)}
                      />
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-900">
                      {contactDisplayName(
                        row.contact.firstName,
                        row.contact.lastName,
                      )}
                      <div className="text-xs font-normal text-slate-500">
                        {row.contact.email ?? (
                          <span className="text-amber-700">Missing email</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {row.contact.title ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
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
                    <td className="px-3 py-3 text-slate-600">
                      Research: {researchLabel}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {displayScore(row.overallScore)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {displayScore(row.icpScore)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {displayScore(row.personaScore)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {displayScore(row.companyScore)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {displayScore(row.productRelevanceScore)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {row.scoreLabel ?? "Pending"}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {row.recommendedAction ?? "Pending"}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-slate-900 underline"
                        onClick={() =>
                          setExpandedId(open ? null : row.id)
                        }
                      >
                        {open ? "Hide" : "View"}
                      </button>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="bg-slate-50">
                      <td colSpan={13} className="px-4 py-4">
                        <div className="space-y-5 text-sm text-slate-700">
                          <section>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Score Breakdown
                            </h4>
                            {asDimensions(row.assessmentData).length === 0 ? (
                              <p className="mt-2 text-slate-400">
                                Not scored yet
                              </p>
                            ) : (
                              <div className="mt-2 space-y-2">
                                {asDimensions(row.assessmentData).map((dim) => (
                                  <div
                                    key={`${dim.dimension}-${dim.assessment}`}
                                    className="rounded-md border border-slate-200 bg-white px-3 py-2"
                                  >
                                    <p className="font-medium text-slate-900">
                                      {dim.dimension}{" "}
                                      <span className="font-normal text-slate-500">
                                        · {dim.assessment} · {dim.confidence}
                                      </span>
                                    </p>
                                    {dim.evidence.length > 0 ? (
                                      <p className="mt-1 text-xs text-slate-600">
                                        Evidence: {dim.evidence.join("; ")}
                                      </p>
                                    ) : null}
                                    {dim.concerns.length > 0 ? (
                                      <p className="mt-1 text-xs text-amber-800">
                                        Concerns: {dim.concerns.join("; ")}
                                      </p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>

                          <div className="grid gap-3 md:grid-cols-2">
                            <Detail
                              label="Company Summary"
                              value={
                                companyResearch?.companySummary ??
                                row.companySummary
                              }
                            />
                            <Detail
                              label="What They Sell"
                              value={
                                companyResearch?.whatTheySell ??
                                row.whatTheySell
                              }
                            />
                            <Detail
                              label="Estimated AOV"
                              value={
                                companyResearch?.estimatedAov ??
                                row.estimatedAov
                              }
                            />
                            <Detail
                              label="AOV Reasoning"
                              value={
                                companyResearch?.aovReasoning ??
                                row.aovReasoning
                              }
                            />
                            <Detail
                              label="Fit Strengths"
                              value={
                                asStringList(row.fitStrengths).join("; ") ||
                                null
                              }
                            />
                            <Detail
                              label="Fit Risks"
                              value={
                                asStringList(row.fitRisks).join("; ") || null
                              }
                            />
                            <Detail
                              label="Disqualifiers"
                              value={
                                asDisqualifierList(row.disqualifiers).join(
                                  "; ",
                                ) || null
                              }
                            />
                            <Detail
                              label="Company Research Status"
                              value={`Research: ${researchLabel}`}
                            />
                            <div className="md:col-span-2">
                              <Detail
                                label="Reasoning"
                                value={row.reasoning}
                              />
                            </div>
                            {row.scoringError ? (
                              <div className="md:col-span-2">
                                <Detail
                                  label="Scoring Error"
                                  value={row.scoringError}
                                />
                              </div>
                            ) : null}
                          </div>

                          <section className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                            <p className="font-medium uppercase tracking-wide text-slate-500">
                              Provenance
                            </p>
                            <p className="mt-1">
                              Scored At: {row.scoredAt ?? "—"} · Model:{" "}
                              {row.aiModel ?? "—"} · Prompt:{" "}
                              {row.promptVersion ?? "—"} · Logic:{" "}
                              {row.scoringLogicVersion ?? "—"} · Research
                              confidence:{" "}
                              {companyResearch?.researchConfidence ?? "—"}
                              {row.aiProvider
                                ? ` · Provider: ${row.aiProvider}`
                                : ""}
                            </p>
                          </section>

                          {row.contact.companyId ? (
                            <Link
                              href={`/companies/${row.contact.companyId}`}
                              className="text-sm font-medium text-slate-900 underline"
                            >
                              Open company research page
                            </Link>
                          ) : null}
                        </div>
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
              <input type="hidden" name="personaId" value={personaId} />
              <Field label="Campaign Name" name="name" required />
              <Field
                label="Offer Name"
                name="offerName"
                placeholder="Free Forecast Audit"
              />
              <Field label="Primary CTA" name="offerCta" placeholder="Book a demo" />
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
                      {value === "ONE_PARAGRAPH"
                        ? "One paragraph"
                        : value === "TWO_PARAGRAPH"
                          ? "Two paragraphs"
                          : "Three paragraphs"}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">
                  Email guidance
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
                  placeholder="Emphasize the free trial"
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Optional, up to {EMAIL_GUIDANCE_MAX_CHARS} characters.
                </span>
              </label>
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

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={cn("mt-1", !value && "text-slate-400")}>
        {value || "Not researched"}
      </p>
    </div>
  );
}

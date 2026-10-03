"use client";

import Link from "next/link";
import { ExclusionDetailList } from "@/components/ExclusionDetailList";
import { SuppressContactForm } from "@/components/SuppressContactForm";
import { cn, contactDisplayName } from "@/lib/utils";
import { hasUsableCompanyResearchFields } from "@/lib/research/freshness";
import { readCriterionProvenanceLabels } from "@/lib/criteria/research-cascade";
import { readExclusionDetails } from "@/lib/scoring/exclusion-detail";
import {
  icpQualificationWhyLines,
  readIcpQualification,
} from "@/lib/scoring/icp-qualification";
import {
  QUALIFICATION_BUCKET_LABELS,
  readQualificationBucket,
  readQualificationReason,
} from "@/lib/workflow/qualification";
import type { QualificationBucket } from "@prisma/client";

export type CompanyResearchView = {
  id: string;
  status: string;
  researchMethod: string;
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
  suppressed?: boolean;
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

export function qualificationBadgeClass(bucket: QualificationBucket | null): string {
  switch (bucket) {
    case "GOOD":
      return "bg-emerald-50 text-emerald-900 ring-emerald-200";
    case "NEEDS_REVIEW":
      return "bg-amber-50 text-amber-900 ring-amber-200";
    case "EXCLUDED":
      return "bg-slate-100 text-slate-800 ring-slate-300";
    case "POOR_FIT":
      return "bg-amber-50 text-amber-900 ring-amber-200";
    default:
      return "bg-slate-50 text-slate-600 ring-slate-200";
  }
}

export function displayQualificationBucket(bucket: QualificationBucket | null): string {
  if (!bucket) return "Pending";
  if (bucket === "POOR_FIT") return QUALIFICATION_BUCKET_LABELS.NEEDS_REVIEW;
  return QUALIFICATION_BUCKET_LABELS[bucket];
}

export function resolveQualification(row: ScoreReportClientRow): {
  bucket: QualificationBucket | null;
  reason: string | null;
} {
  const bucket =
    readQualificationBucket(row.assessmentData) ??
    (row.scoringStatus === "SUPPRESSED" || row.suppressed
      ? "EXCLUDED"
      : null);
  const reason =
    readQualificationReason(row.assessmentData) ??
    row.recommendedAction ??
    row.reasoning;
  return { bucket, reason };
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
        evidence: asStringList(row.evidence),
        concerns: asStringList(row.concerns),
      };
    })
    .filter((d): d is DimensionView => Boolean(d?.dimension));
}

export function companyResearchLabel(
  research: CompanyResearchView | null | undefined,
): string {
  if (
    research &&
    (research.status === "COMPLETED" || research.status === "PARTIAL")
  ) {
    return hasUsableCompanyResearchFields(research)
      ? "Available"
      : "No usable details found";
  }
  switch (research?.status) {
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

function Detail({ label, value }: { label: string; value: string | null }) {
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

/** Expanded score-report detail for one contact. */
export function ScoreDetailPanel({
  row,
  showCompanyLink = true,
  showSuppress = true,
}: {
  row: ScoreReportClientRow;
  showCompanyLink?: boolean;
  showSuppress?: boolean;
}) {
  const companyResearch = row.contact.companyRecord?.research?.[0];
  const qualification = readIcpQualification(row.assessmentData);
  const resolvedQualification = resolveQualification(row);
  const exclusionDetails = readExclusionDetails(row.assessmentData);
  const why = qualification ? icpQualificationWhyLines(qualification) : null;
  const factsUsed = readCriterionProvenanceLabels(row.assessmentData);
  const researchLabel = companyResearchLabel(companyResearch);

  return (
    <div className="space-y-5 text-sm text-slate-700" data-testid="score-detail-panel">
      {showSuppress ? (
        <SuppressContactForm
          contactId={row.contactId}
          email={row.contact.email}
          suppressed={Boolean(
            row.suppressed || row.scoringStatus === "SUPPRESSED",
          )}
        />
      ) : null}
      {exclusionDetails.length > 0 ? (
        <section data-testid="exclusion-detail-panel">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-rose-800">
            Exclusion details
          </h4>
          <div className="mt-2">
            <ExclusionDetailList details={exclusionDetails} />
          </div>
        </section>
      ) : null}
      {why?.failedLines && why.failedLines !== "None" ? (
        <section data-testid="icp-confirmed-failures">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-rose-800">
            Confirmed misses
          </h4>
          <ul className="mt-2 space-y-1 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-950">
            {qualification?.primaryFailedLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Qualification
        </h4>
        <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
          <p>
            Bucket: {displayQualificationBucket(resolvedQualification.bucket)}
          </p>
          <p className="mt-1">
            Reason: {resolvedQualification.reason ?? "—"}
          </p>
          {row.overallScore != null ? (
            <p className="mt-1 tabular-nums text-slate-500">
              Legacy score: overall {row.overallScore}
              {row.icpScore != null ? ` · ICP ${row.icpScore}` : ""}
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Score Breakdown
        </h4>
        {asDimensions(row.assessmentData).length === 0 ? (
          <p className="mt-2 text-slate-400">Not scored yet</p>
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
                    · {dim.assessment}
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

      {why ? (
        <section data-testid="icp-qualification-why">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Why this ICP result
          </h4>
          <div className="mt-2 space-y-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
            {why.mandatory ? (
              <p className="font-medium text-red-800">
                Disqualified by confirmed failure: {why.mandatory}
              </p>
            ) : null}
            <p>Primary passed: {why.passed}</p>
            <p>Primary unresolved: {why.unresolved}</p>
            <p>Primary failed: {why.failed}</p>
            <p>Secondary signals found: {why.secondary}</p>
          </div>
        </section>
      ) : null}

      {factsUsed.length > 0 ? (
        <section data-testid="icp-criterion-provenance">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Facts used
          </h4>
          <ul className="mt-2 space-y-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
            {factsUsed.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Detail
          label="Company Summary"
          value={companyResearch?.companySummary ?? row.companySummary}
        />
        <Detail
          label="What They Sell"
          value={companyResearch?.whatTheySell ?? row.whatTheySell}
        />
        <Detail
          label="Estimated AOV"
          value={companyResearch?.estimatedAov ?? row.estimatedAov}
        />
        <Detail
          label="AOV Reasoning"
          value={companyResearch?.aovReasoning ?? row.aovReasoning}
        />
        <Detail
          label="Fit Strengths"
          value={asStringList(row.fitStrengths).join("; ") || null}
        />
        <Detail
          label="Fit Risks"
          value={asStringList(row.fitRisks).join("; ") || null}
        />
        <Detail
          label="Disqualifiers"
          value={asDisqualifierList(row.disqualifiers).join("; ") || null}
        />
        <Detail
          label="Company Research Status"
          value={`Research: ${researchLabel}`}
        />
        <div className="md:col-span-2">
          <Detail label="Reasoning" value={row.reasoning} />
        </div>
        <div className="md:col-span-2">
          <Detail label="Recommended Action" value={row.recommendedAction} />
        </div>
        {row.scoringError ? (
          <div className="md:col-span-2">
            <Detail label="Scoring Error" value={row.scoringError} />
          </div>
        ) : null}
      </div>

      <section className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        <p className="font-medium uppercase tracking-wide text-slate-500">
          Provenance
        </p>
        <p className="mt-1">
          Scored At: {row.scoredAt ?? "—"} · Model: {row.aiModel ?? "—"} ·
          Prompt: {row.promptVersion ?? "—"} · Logic:{" "}
          {row.scoringLogicVersion ?? "—"}
          {row.aiProvider ? ` · Provider: ${row.aiProvider}` : ""}
        </p>
      </section>

      {showCompanyLink && row.contact.companyId ? (
        <Link
          href={`/companies/${row.contact.companyId}`}
          className="text-sm font-medium text-slate-900 underline"
        >
          Open company research page
        </Link>
      ) : null}
    </div>
  );
}

export function InlineScoreDetails({
  rows,
  targetType,
}: {
  rows: ScoreReportClientRow[];
  targetType: "CONTACT" | "COMPANY";
}) {
  return (
    <div className="mt-3 space-y-4" data-testid="inline-score-detail">
      {rows.map((row) => (
        <section
          key={row.id}
          data-testid={`inline-score-detail-${targetType}-${row.contactId}`}
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3"
        >
          {targetType === "COMPANY" ? (
            <h4 className="mb-3 text-sm font-semibold text-slate-900">
              {contactDisplayName(row.contact.firstName, row.contact.lastName)}
              {row.contact.title ? ` · ${row.contact.title}` : ""}
            </h4>
          ) : null}
          <ScoreDetailPanel
            row={row}
            showCompanyLink={false}
            showSuppress={false}
          />
        </section>
      ))}
    </div>
  );
}

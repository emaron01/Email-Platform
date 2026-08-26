import Link from "next/link";
import { notFound } from "next/navigation";
import type { ScoreLabel, ResearchStatus } from "@prisma/client";
import { ResearchRunPanel } from "@/components/ResearchRunPanel";
import { ScoreContactsPanel } from "@/components/ScoreContactsPanel";
import { ScoreReportClient } from "@/components/ScoreReportClient";
import { TitleSuggestionReview } from "@/components/TitleSuggestionReview";
import {
  PageHeader,
  Panel,
  PrimaryButton,
  TenantMissing,
} from "@/components/ui";
import {
  getScoreReportRows,
  getScoringRun,
  listPersonas,
  type ScoreReportSort,
} from "@/lib/tenant/data";
import { getCompaniesNeedingResearchForScoringRun } from "@/lib/tenant/companies";
import { getScoringReadiness } from "@/lib/scoring/engine";
import { collectMandatorySuggestions } from "@/lib/scoring/mandatory-suggestion";
import type { IcpSnapshot } from "@/lib/scoring/types";
import { listTitleSuggestionsForRun } from "@/lib/scoring/title-suggestions";
import {
  contactMatchesSuppressionSet,
  listActiveNormalizedEmails,
} from "@/lib/suppression/service";
import { isResearchAiConfigured } from "@/lib/ai/config";
import {
  listAiRoleStatuses,
  listUnconfiguredScoringRoles,
} from "@/lib/ai/roles";
import { AiRoleStatusList } from "@/components/AiRoleStatusList";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { formatDate, formatNumber } from "@/lib/utils";

type PageProps = {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{
    scoreLabel?: string;
    minOverallScore?: string;
    company?: string;
    researchStatus?: string;
    sort?: string;
    sortDir?: string;
  }>;
};

const SORTS: ScoreReportSort[] = [
  "overallScore",
  "icpScore",
  "personaScore",
  "companyScore",
  "productRelevanceScore",
  "company",
  "name",
];

export default async function ScoringReportPage({
  params,
  searchParams,
}: PageProps) {
  const organization = await getCurrentOrganization();
  const { runId } = await params;
  const query = await searchParams;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Score Report" description="Scoring run report." />
        <TenantMissing />
      </div>
    );
  }

  let run;
  try {
    run = await getScoringRun(runId);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const sort = SORTS.includes(query.sort as ScoreReportSort)
    ? (query.sort as ScoreReportSort)
    : "name";
  const sortDir = query.sortDir === "desc" ? "desc" : "asc";
  const minOverallScore = query.minOverallScore
    ? Number.parseInt(query.minOverallScore, 10)
    : null;

  const [rows, researchPlan, scoringReadiness, personas, titleSuggestions] =
    await Promise.all([
      getScoreReportRows(runId, {
        scoreLabel: (query.scoreLabel as ScoreLabel | undefined) || "",
        researchStatus:
          (query.researchStatus as ResearchStatus | undefined) || "",
        company: query.company || "",
        minOverallScore: Number.isFinite(minOverallScore)
          ? minOverallScore
          : null,
        sort,
        sortDir,
      }),
      getCompaniesNeedingResearchForScoringRun(runId),
      getScoringReadiness(runId),
      listPersonas(run.productId),
      listTitleSuggestionsForRun(runId),
    ]);

  const suppressedEmails = await listActiveNormalizedEmails(
    organization.id,
    rows.map((row) => row.contact.email),
  );

  const mandatorySuggestions = collectMandatorySuggestions({
    criteria: (run.icpSnapshot as IcpSnapshot | null)?.criteria ?? [],
    scores: rows.map((row) => ({
      companyKey: row.contact.companyId ?? row.contactId,
      criterionAssessments: row.criterionAssessments,
      assessmentData: row.assessmentData,
    })),
  });

  return (
    <div>
      <PageHeader
        title="Score Report"
        description="Deterministic qualification by ICP criteria and persona title fit. Numeric scores are deferred; contacts are marked Good, Needs review, or Excluded with a reason."
        actions={
          <Link
            href={`/lists/${run.contactListId}`}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Back to list
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Meta label="List" value={run.contactList.name} />
        <Meta label="Product" value={run.product.name} />
        <Meta label="ICP" value={run.icp.name} />
        <Meta label="Persona" value={run.persona?.name ?? "All personas"} />
        <Meta label="Total Contacts" value={formatNumber(run.totalContacts)} />
        <Meta label="Scored Contacts" value={formatNumber(run.scoredContacts)} />
        <Meta label="Status" value={run.status} />
        <Meta label="Created" value={formatDate(run.createdAt)} />
      </div>

      <div className="mb-6">
        <Panel
          title="AI roles for this run"
          description="Scoring needs Contact scoring and Contact research. Company research is optional but shown so an unset role cannot hide."
        >
          <AiRoleStatusList
            roles={listAiRoleStatuses().filter(
              (role) =>
                role.requiredForScoring || role.role === "research",
            )}
          />
          {listUnconfiguredScoringRoles().length > 0 ? (
            <p className="mt-3 text-sm text-amber-950">
              Score Contacts stays disabled until every required role is
              configured. Set the listed environment variables and restart.
            </p>
          ) : null}
        </Panel>
      </div>

      <div className="mb-6">
        <Panel
          title="Company Research"
          description="Research is company-level and reusable across contacts, lists, and scoring runs in this organization."
        >
          <ResearchRunPanel
            runId={run.id}
            researchAiConfigured={isResearchAiConfigured()}
            plan={{
              totalContacts: researchPlan.totalContacts,
              uniqueCompanies: researchPlan.uniqueCompanies,
              alreadyResearched: researchPlan.alreadyResearched,
              needingResearch: researchPlan.needingResearch,
              statusCounts: researchPlan.statusCounts,
            }}
          />
        </Panel>
      </div>

      <div className="mb-6">
        <Panel
          title="AI Scoring"
          description="Qualifies contacts using company ICP criteria and persona title fit. Contact role research runs when you generate email, not during scoring."
        >
          <ScoreContactsPanel
            runId={run.id}
            readiness={scoringReadiness}
          />
        </Panel>
      </div>

      {titleSuggestions.some((row) => row.status === "PENDING") ? (
        <div className="mb-6">
          <Panel
            title="Unmatched titles"
            description="Review titles that did not match a persona. Approvals are saved on the persona so the next list can match them automatically."
          >
            <TitleSuggestionReview
              runId={run.id}
              personas={personas.map((persona) => ({
                id: persona.id,
                name: persona.name,
              }))}
              suggestions={titleSuggestions.map((row) => ({
                id: row.id,
                unmatchedTitle: row.unmatchedTitle,
                contactCount: row.contactCount,
                proposedPersonaId: row.proposedPersonaId,
                proposedPersonaName: row.proposedPersonaName,
                confidence: row.confidence,
                reasoning: row.reasoning,
                status: row.status,
              }))}
            />
          </Panel>
        </div>
      ) : null}

      <Panel title="Filters" description="Simple tenant-scoped filters for this scoring run.">
        <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Score Label</span>
            <select
              name="scoreLabel"
              defaultValue={query.scoreLabel ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="EXCELLENT">EXCELLENT</option>
              <option value="GOOD">GOOD</option>
              <option value="FAIR">FAIR</option>
              <option value="POOR">POOR</option>
              <option value="DISQUALIFIED">DISQUALIFIED</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Min Overall</span>
            <input
              name="minOverallScore"
              type="number"
              min={0}
              max={100}
              defaultValue={query.minOverallScore ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Company</span>
            <input
              name="company"
              defaultValue={query.company ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Research Status</span>
            <select
              name="researchStatus"
              defaultValue={query.researchStatus ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="NOT_STARTED">NOT_STARTED</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="FAILED">FAILED</option>
              <option value="NOT_REQUIRED">NOT_REQUIRED</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Sort</span>
            <select
              name="sort"
              defaultValue={sort}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {SORTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Direction</span>
            <select
              name="sortDir"
              defaultValue={sortDir}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
          <div className="flex items-end md:col-span-3 xl:col-span-6">
            <PrimaryButton type="submit">Apply</PrimaryButton>
          </div>
        </form>
      </Panel>

      <div className="mt-6">
        <ScoreReportClient
          runId={run.id}
          productId={run.productId}
          icpId={run.icpId}
          personaId={run.personaId}
          productName={run.product.name}
          icpName={run.icp.name}
          personaName={run.persona?.name ?? "All personas"}
          personas={personas.map((persona) => ({
            id: persona.id,
            name: persona.name,
          }))}
          mandatorySuggestions={mandatorySuggestions}
          rows={rows.map((row) => ({
            id: row.id,
            contactId: row.contactId,
            overallScore: row.overallScore,
            icpScore: row.icpScore,
            personaScore: row.personaScore,
            companyScore: row.companyScore,
            productRelevanceScore: row.productRelevanceScore,
            scoreLabel: row.scoreLabel,
            recommendedAction: row.recommendedAction,
            companySummary: row.companySummary,
            whatTheySell: row.whatTheySell,
            estimatedAov: row.estimatedAov,
            aovReasoning: row.aovReasoning,
            fitStrengths: row.fitStrengths,
            fitRisks: row.fitRisks,
            disqualifiers: row.disqualifiers,
            reasoning: row.reasoning,
            researchStatus: row.researchStatus,
            researchSources: row.researchSources,
            scoringStatus: row.scoringStatus,
            suppressed:
              row.scoringStatus === "SUPPRESSED" ||
              contactMatchesSuppressionSet(
                row.contact.email,
                suppressedEmails,
              ),
            assessmentData: row.assessmentData,
            aiProvider: row.aiProvider,
            aiModel: row.aiModel,
            aiModelUrlIdentifier: row.aiModelUrlIdentifier,
            promptVersion: row.promptVersion,
            scoringLogicVersion: row.scoringLogicVersion,
            scoredAt: row.scoredAt ? row.scoredAt.toISOString() : null,
            scoringError: row.scoringError,
            contact: {
              ...row.contact,
              companyRecord: row.contact.companyRecord
                ? {
                    ...row.contact.companyRecord,
                    research: row.contact.companyRecord.research.map((r) => ({
                      ...r,
                      researchedAt: r.researchedAt
                        ? r.researchedAt.toISOString()
                        : null,
                    })),
                  }
                : null,
            },
          }))}
        />
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

import { getScoringAiConfig, getScoringAiProvider } from "@/lib/ai";
import { generateScoringAssessment } from "@/lib/scoring/ai-assessment";
import { calculateScoresFromAssessment } from "@/lib/scoring/calculate";
import { resolveIcpQualification } from "@/lib/scoring/icp-qualification";
import {
  SCORING_CONCURRENCY,
  SCORING_LOGIC_VERSION,
  SCORING_PROMPT_VERSION,
} from "@/lib/scoring/config";
import { getApplicableDimensions } from "@/lib/scoring/dimensions";
import {
  buildScoringPayload,
  type ScoringContactResearchInput,
  type ScoringCompanyResearchInput,
} from "@/lib/scoring/payload";
import { evaluatePersonaExclusions } from "@/lib/scoring/persona-exclusions";
import type {
  IcpSnapshot,
  PersonaSnapshot,
  ProductSnapshot,
} from "@/lib/scoring/types";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/org/authz";
import { recordUsageEvent } from "@/lib/usage/events";
import {
  requireOrganizationId,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { parseStringArray } from "@/lib/research";
import { isScoringAiConfigured } from "@/lib/ai/config";

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function run(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current]!);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run(),
  );
  await Promise.all(runners);
  return results;
}

function asSnapshot<T>(value: unknown): T {
  return value as T;
}

function toResearchInput(
  research: {
    status: string;
    researchConfidence: string | null;
    companySummary: string | null;
    whatTheySell: string | null;
    customerTypes: unknown;
    primaryMarkets: unknown;
    businessModel: string | null;
    estimatedAov: string | null;
    aovReasoning: string | null;
    companySizeContext: string | null;
    relevantTechnologies: unknown;
    buyingSignals: unknown;
    riskSignals: unknown;
    researchedAt: Date | null;
  } | null,
): ScoringCompanyResearchInput {
  if (!research) return null;
  return {
    status: research.status,
    researchConfidence: research.researchConfidence,
    companySummary: research.companySummary,
    whatTheySell: research.whatTheySell,
    customerTypes: parseStringArray(research.customerTypes),
    primaryMarkets: parseStringArray(research.primaryMarkets),
    businessModel: research.businessModel,
    estimatedAov: research.estimatedAov,
    aovReasoning: research.aovReasoning,
    companySizeContext: research.companySizeContext,
    relevantTechnologies: parseStringArray(research.relevantTechnologies),
    buyingSignals: parseStringArray(research.buyingSignals),
    riskSignals: parseStringArray(research.riskSignals),
    researchedAt: research.researchedAt?.toISOString() ?? null,
  };
}

function toContactResearchInput(
  research: {
    status: string;
    confidence: string | null;
    roleSummary: string | null;
    responsibilities: unknown;
    ownershipAreas: unknown;
    professionalSignals: unknown;
    negativeRoleSignals: unknown;
    researchedAt: Date | null;
  } | null,
): ScoringContactResearchInput {
  if (!research) return null;
  return {
    status: research.status,
    confidence: research.confidence,
    roleSummary: research.roleSummary,
    responsibilities: parseStringArray(research.responsibilities),
    ownershipAreas: parseStringArray(research.ownershipAreas),
    professionalSignals: parseStringArray(research.professionalSignals),
    negativeRoleSignals: parseStringArray(research.negativeRoleSignals),
    researchedAt: research.researchedAt?.toISOString() ?? null,
  };
}

export type ScoreContactResult = {
  contactScoreId: string;
  contactId: string;
  ok: boolean;
  error?: string;
};

export async function scoreSingleContact(input: {
  organizationId: string;
  scoringRunId: string;
  contactScoreId: string;
  product: ProductSnapshot;
  icp: IcpSnapshot;
  persona: PersonaSnapshot;
}): Promise<ScoreContactResult> {
  const scoreRow = await prisma.contactScore.findFirst({
    where: {
      id: input.contactScoreId,
      organizationId: input.organizationId,
      scoringRunId: input.scoringRunId,
    },
    include: {
      contact: {
        include: {
          companyRecord: {
            include: {
              research: {
                orderBy: { updatedAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!scoreRow) {
    throw new TenantError(
      "Contact score not found in the active organization.",
    );
  }

  await prisma.contactScore.update({
    where: { id: scoreRow.id },
    data: { scoringStatus: "IN_PROGRESS" },
  });

  try {
    const contact = scoreRow.contact;
    const company = contact.companyRecord;
    const latestResearch = company?.research[0] ?? null;
    const applicable = getApplicableDimensions({
      icp: input.icp,
      persona: input.persona,
      product: input.product,
    });
    const titleExclusionConfirmed = evaluatePersonaExclusions({
      criteria: input.persona.criteria ?? [],
      title: contact.title,
      contactResearch: null,
    }).some(
      (assessment) =>
        assessment.testability === "TITLE_TESTABLE" &&
        assessment.outcome === "CONFIRMED",
    );

    // Progressive contact-role research when persona criteria warrant it.
    let contactResearchRow: {
      id: string;
      researchedAt: Date | null;
      status: string;
      confidence: string | null;
      roleSummary: string | null;
      responsibilities: unknown;
      ownershipAreas: unknown;
      professionalSignals: unknown;
      negativeRoleSignals: unknown;
    } | null = null;
    if (!titleExclusionConfirmed) {
      try {
        const { getResearchPolicy } = await import("@/lib/usage/policy");
        const { researchContactRole } =
          await import("@/lib/contact-research/service");
        const policy = await getResearchPolicy(input.organizationId);
        const cr = await researchContactRole({
          organizationId: input.organizationId,
          contactId: contact.id,
          personaCriteria: input.persona.criteria ?? [],
          policy: {
            maxSearchQueriesPerContact: policy.maxSearchQueriesPerContact,
            maxSourcesPerContact: policy.maxSourcesPerContact,
            contactResearchFreshnessDays: policy.contactResearchFreshnessDays,
          },
        });
        contactResearchRow = {
          id: cr.id,
          researchedAt: cr.researchedAt,
          status: cr.status,
          confidence: cr.confidence,
          roleSummary: cr.roleSummary,
          responsibilities: cr.responsibilities,
          ownershipAreas: cr.ownershipAreas,
          professionalSignals: cr.professionalSignals,
          negativeRoleSignals: cr.negativeRoleSignals,
        };
      } catch {
        // Contact research failures must not block scoring; leave provenance null.
        contactResearchRow = null;
      }
    }
    const contactResearch = toContactResearchInput(contactResearchRow);
    const personaExclusionAssessments = evaluatePersonaExclusions({
      criteria: input.persona.criteria ?? [],
      title: contact.title,
      contactResearch,
    });

    // Deterministic / asymmetric ICP criterion pre-evaluation.
    const { resolveCompanyActualForCriterion } =
      await import("@/lib/criteria/evaluate");
    const { evaluateIcpCriterionWithEvidenceClass } =
      await import("@/lib/criteria/targeted-search-eval");
    const criterionAssessments: Array<
      ReturnType<typeof evaluateIcpCriterionWithEvidenceClass>
    > = [];
    for (const criterion of input.icp.criteria ?? []) {
      const actual = resolveCompanyActualForCriterion(
        criterion,
        {
          industry: company?.industry ?? contact.industry,
          employeeCount: company?.employeeCount ?? contact.employeeCount,
          revenue: company?.revenue ?? contact.revenue,
          location: company?.location ?? contact.location,
        },
        latestResearch
          ? {
              relevantTechnologies: parseStringArray(
                latestResearch.relevantTechnologies,
              ),
              buyingSignals: parseStringArray(latestResearch.buyingSignals),
              riskSignals: parseStringArray(latestResearch.riskSignals),
              primaryMarkets: parseStringArray(latestResearch.primaryMarkets),
            }
          : null,
      );
      criterionAssessments.push(
        evaluateIcpCriterionWithEvidenceClass({
          criterion,
          actualValue: actual,
        }),
      );
    }

    const researchStatus =
      !latestResearch || latestResearch.status === "NOT_STARTED"
        ? "NOT_STARTED"
        : latestResearch.status === "FAILED"
          ? "FAILED"
          : latestResearch.status === "COMPLETED" ||
              latestResearch.status === "PARTIAL"
            ? "COMPLETED"
            : "IN_PROGRESS";
    const confirmedPersonaExclusions = personaExclusionAssessments.filter(
      (assessment) => assessment.outcome === "CONFIRMED",
    );

    if (confirmedPersonaExclusions.length > 0) {
      const disqualifiers = confirmedPersonaExclusions.map((assessment) => ({
        criterion: assessment.criterion,
        evidence: assessment.evidence,
        confidence: assessment.confidence,
        scope: "PERSONA" as const,
        matchedPersonaCriterion: assessment.criterion,
      }));
      await prisma.contactScore.update({
        where: { id: scoreRow.id },
        data: {
          scoringStatus: "COMPLETED",
          overallScore: 0,
          icpScore: null,
          personaScore: 0,
          companyScore: null,
          productRelevanceScore: null,
          scoreLabel: "DISQUALIFIED",
          companySummary: latestResearch?.companySummary ?? null,
          whatTheySell: latestResearch?.whatTheySell ?? null,
          estimatedAov: latestResearch?.estimatedAov ?? null,
          aovReasoning: latestResearch?.aovReasoning ?? null,
          fitStrengths: [],
          fitRisks: confirmedPersonaExclusions.map(
            (assessment) => assessment.reasoning,
          ),
          disqualifiers,
          reasoning: confirmedPersonaExclusions
            .map((assessment) => assessment.reasoning)
            .join(" "),
          recommendedAction: "Exclude from this persona.",
          researchStatus,
          researchSources: latestResearch?.researchSources ?? undefined,
          researchedAt: latestResearch?.researchedAt ?? null,
          companyResearchId: latestResearch?.id ?? null,
          companyResearchAt: latestResearch?.researchedAt ?? null,
          contactResearchId: contactResearchRow?.id ?? null,
          contactResearchAt: contactResearchRow?.researchedAt ?? null,
          criterionAssessments: [
            ...criterionAssessments,
            ...personaExclusionAssessments,
          ],
          assessmentData: {
            dimensions: [],
            unknownDimensionCount: 0,
            disqualifiers,
            criterionAssessments,
            personaExclusionAssessments,
            icpQualification: resolveIcpQualification({
              criteria: input.icp.criteria ?? [],
              assessments: criterionAssessments,
            }),
            aiSkipped: true,
            aiSkipReason: "CONFIRMED_PERSONA_EXCLUSION",
          },
          aiProvider: null,
          aiModel: null,
          aiModelUrlIdentifier: null,
          promptVersion: null,
          scoringLogicVersion: SCORING_LOGIC_VERSION,
          scoredAt: new Date(),
          scoringError: null,
        },
      });

      const user = await getCurrentUser();
      await recordUsageEvent({
        organizationId: input.organizationId,
        userId: user?.id ?? null,
        category: "SCORING",
        operation: "CONTACT_SCORING",
        companyId: company?.id ?? null,
        contactId: contact.id,
        scoringRunId: input.scoringRunId,
        status: "SUCCESS",
        metadata: {
          aiSkipped: true,
          reason: "CONFIRMED_PERSONA_EXCLUSION",
        },
      });
      return {
        contactScoreId: scoreRow.id,
        contactId: contact.id,
        ok: true,
      };
    }

    const payload = buildScoringPayload({
      contact: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        title: contact.title,
        company: contact.company,
        industry: contact.industry ?? company?.industry ?? null,
        employeeCount: contact.employeeCount ?? company?.employeeCount ?? null,
        revenue:
          contact.revenue != null
            ? String(contact.revenue)
            : company?.revenue != null
              ? String(company.revenue)
              : null,
        location: contact.location ?? company?.location ?? null,
      },
      company: company
        ? {
            name: company.name,
            website: company.website,
            normalizedDomain: company.normalizedDomain,
            industry: company.industry,
            employeeCount: company.employeeCount,
            revenue: company.revenue != null ? String(company.revenue) : null,
            location: company.location,
          }
        : null,
      companyResearch: toResearchInput(latestResearch),
      contactResearch,
      product: input.product,
      icp: input.icp,
      persona: input.persona,
      applicableDimensions: applicable,
    });

    const config = getScoringAiConfig();
    const provider = getScoringAiProvider();
    const aiResponse = await generateScoringAssessment({
      provider,
      payload,
      maxRetries: config.maxRetries,
    });

    const calculated = calculateScoresFromAssessment({
      assessment: aiResponse.data,
      applicable,
      icp: input.icp,
      persona: input.persona,
      contactResearch,
      personaExclusionAssessments,
      criterionEvidenceAssessments: criterionAssessments,
    });

    await prisma.contactScore.update({
      where: { id: scoreRow.id },
      data: {
        scoringStatus: "COMPLETED",
        overallScore: calculated.overallScore,
        icpScore: calculated.icpScore,
        personaScore: calculated.personaScore,
        companyScore: calculated.companyScore,
        productRelevanceScore: calculated.productRelevanceScore,
        scoreLabel: calculated.scoreLabel,
        companySummary: latestResearch?.companySummary ?? null,
        whatTheySell: latestResearch?.whatTheySell ?? null,
        estimatedAov: latestResearch?.estimatedAov ?? null,
        aovReasoning: latestResearch?.aovReasoning ?? null,
        fitStrengths: calculated.fitStrengths,
        fitRisks: calculated.fitRisks,
        disqualifiers: calculated.disqualifiers,
        reasoning: calculated.reasoning,
        recommendedAction: calculated.recommendedAction,
        researchStatus,
        researchSources: latestResearch?.researchSources ?? undefined,
        researchedAt: latestResearch?.researchedAt ?? null,
        companyResearchId: latestResearch?.id ?? null,
        companyResearchAt: latestResearch?.researchedAt ?? null,
        contactResearchId: contactResearchRow?.id ?? null,
        contactResearchAt: contactResearchRow?.researchedAt ?? null,
        criterionAssessments: [
          ...criterionAssessments,
          ...personaExclusionAssessments,
        ],
        assessmentData: {
          dimensions: calculated.dimensions,
          unknownDimensionCount: calculated.unknownDimensionCount,
          componentCoverage: calculated.componentCoverage,
          icpQualification: calculated.icpQualification,
          fitStrengths: calculated.fitStrengths,
          fitRisks: calculated.fitRisks,
          disqualifiers: calculated.disqualifiers,
          researchIncomplete: payload.researchIncomplete,
          researchLowConfidence: payload.researchLowConfidence,
          criterionAssessments,
          personaExclusionAssessments,
          /** Confirmed vs unverifiable TARGETED_SEARCH outcomes for later qualification UI. */
          targetedSearchOutcomes: criterionAssessments
            .filter((c) => c.evidenceClass === "TARGETED_SEARCH")
            .map((c) => ({
              name: c.name,
              criterionId: c.criterionId ?? null,
              evidenceOutcome: c.evidenceOutcome,
              reasoning: c.reasoning,
            })),
        },
        aiProvider: aiResponse.provider,
        aiModel: aiResponse.model,
        aiModelUrlIdentifier: aiResponse.modelUrlIdentifier,
        promptVersion: SCORING_PROMPT_VERSION,
        scoringLogicVersion: SCORING_LOGIC_VERSION,
        scoredAt: new Date(),
        scoringError: null,
      },
    });

    const user = await getCurrentUser();
    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: user?.id ?? null,
      category: "SCORING",
      operation: "CONTACT_SCORING",
      provider: aiResponse.provider,
      model: aiResponse.model,
      companyId: company?.id ?? null,
      contactId: contact.id,
      scoringRunId: input.scoringRunId,
      inputTokens: aiResponse.usage?.inputTokens ?? null,
      outputTokens: aiResponse.usage?.outputTokens ?? null,
      status: "SUCCESS",
    });

    return {
      contactScoreId: scoreRow.id,
      contactId: contact.id,
      ok: true,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown scoring failure.";

    await prisma.contactScore.update({
      where: { id: scoreRow.id },
      data: {
        scoringStatus: "FAILED",
        scoringError: message.slice(0, 2000),
      },
    });

    const user = await getCurrentUser();
    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: user?.id ?? null,
      category: "SCORING",
      operation: "CONTACT_SCORING",
      contactId: scoreRow.contactId,
      scoringRunId: input.scoringRunId,
      status: "FAILED",
      metadata: { error: message.slice(0, 500) },
    });

    return {
      contactScoreId: scoreRow.id,
      contactId: scoreRow.contactId,
      ok: false,
      error: message,
    };
  }
}

export type RunScoringSummary = {
  totalContacts: number;
  attempted: number;
  completed: number;
  failed: number;
  companiesResearched: number;
  companiesMissingResearch: number;
  status: "COMPLETED" | "PARTIAL" | "FAILED";
};

export async function getScoringReadiness(scoringRunId: string): Promise<{
  totalContacts: number;
  companiesResearched: number;
  companiesMissingResearch: number;
  alreadyScored: number;
  pending: number;
  failed: number;
  aiConfigured: boolean;
}> {
  const organizationId = await requireOrganizationId();
  const run = await prisma.scoringRun.findFirst({
    where: { id: scoringRunId, organizationId },
    select: { id: true, contactListId: true },
  });
  if (!run)
    throw new TenantError("Scoring run not found in the active organization.");

  const scores = await prisma.contactScore.findMany({
    where: { organizationId, scoringRunId },
    include: {
      contact: {
        select: {
          companyId: true,
          companyRecord: {
            select: {
              research: {
                orderBy: { updatedAt: "desc" },
                take: 1,
                select: { status: true, researchConfidence: true },
              },
            },
          },
        },
      },
    },
  });

  const companyResearch = new Map<string, boolean>();
  for (const row of scores) {
    const companyId = row.contact.companyId;
    if (!companyId) continue;
    const latest = row.contact.companyRecord?.research[0];
    const ok =
      latest != null &&
      (latest.status === "COMPLETED" || latest.status === "PARTIAL") &&
      latest.researchConfidence !== "LOW";
    companyResearch.set(companyId, ok);
  }

  let companiesResearched = 0;
  let companiesMissingResearch = 0;
  for (const ok of companyResearch.values()) {
    if (ok) companiesResearched += 1;
    else companiesMissingResearch += 1;
  }

  const { isScoringAiConfigured } = await import("@/lib/ai/config");

  return {
    totalContacts: scores.length,
    companiesResearched,
    companiesMissingResearch,
    alreadyScored: scores.filter((s) => s.scoringStatus === "COMPLETED").length,
    pending: scores.filter(
      (s) =>
        s.scoringStatus === "PENDING" ||
        s.scoringStatus === "FAILED" ||
        s.scoringStatus === "IN_PROGRESS",
    ).length,
    failed: scores.filter((s) => s.scoringStatus === "FAILED").length,
    aiConfigured: isScoringAiConfigured(),
  };
}

export async function runScoringForRun(
  scoringRunId: string,
  options?: { rescoreFailedOnly?: boolean; forceRescore?: boolean },
): Promise<RunScoringSummary> {
  const organizationId = await requireOrganizationId();

  // Fail closed before mutating run state
  getScoringAiConfig();

  const run = await prisma.scoringRun.findFirst({
    where: { id: scoringRunId, organizationId },
  });
  if (!run) {
    throw new TenantError("Scoring run not found in the active organization.");
  }

  const product = asSnapshot<ProductSnapshot>(run.productSnapshot);
  const icp = asSnapshot<IcpSnapshot>(run.icpSnapshot);
  const persona = asSnapshot<PersonaSnapshot>(run.personaSnapshot);

  await prisma.scoringRun.update({
    where: { id: run.id },
    data: { status: "IN_PROGRESS", completedAt: null },
  });

  const scores = await prisma.contactScore.findMany({
    where: { organizationId, scoringRunId: run.id },
    select: { id: true, contactId: true, scoringStatus: true },
    orderBy: { createdAt: "asc" },
  });

  const targets = scores.filter((row) => {
    if (options?.forceRescore) return true;
    if (options?.rescoreFailedOnly) return row.scoringStatus === "FAILED";
    return row.scoringStatus !== "COMPLETED";
  });

  const readiness = await getScoringReadiness(run.id);

  const results = await mapPool(targets, SCORING_CONCURRENCY, (row) =>
    scoreSingleContact({
      organizationId,
      scoringRunId: run.id,
      contactScoreId: row.id,
      product,
      icp,
      persona,
    }),
  );

  const completedNow = results.filter((r) => r.ok).length;
  const failedNow = results.filter((r) => !r.ok).length;

  const refreshed = await prisma.contactScore.findMany({
    where: { organizationId, scoringRunId: run.id },
    select: { scoringStatus: true },
  });

  const completedTotal = refreshed.filter(
    (r) => r.scoringStatus === "COMPLETED",
  ).length;
  const failedTotal = refreshed.filter(
    (r) => r.scoringStatus === "FAILED",
  ).length;
  const pendingTotal = refreshed.filter(
    (r) => r.scoringStatus === "PENDING" || r.scoringStatus === "IN_PROGRESS",
  ).length;

  let status: RunScoringSummary["status"] = "COMPLETED";
  if (completedTotal === 0 && failedTotal > 0) status = "FAILED";
  else if (failedTotal > 0 || pendingTotal > 0) status = "PARTIAL";
  else status = "COMPLETED";

  await prisma.scoringRun.update({
    where: { id: run.id },
    data: {
      status,
      scoredContacts: completedTotal,
      totalContacts: refreshed.length,
      completedAt: new Date(),
    },
  });

  return {
    totalContacts: refreshed.length,
    attempted: results.length,
    completed: completedNow,
    failed: failedNow,
    companiesResearched: readiness.companiesResearched,
    companiesMissingResearch: readiness.companiesMissingResearch,
    status,
  };
}

import { getScoringAiConfig, getScoringAiProvider } from "@/lib/ai";
import { generateScoringAssessment } from "@/lib/scoring/ai-assessment";
import { calculateScoresFromAssessment } from "@/lib/scoring/calculate";
import { resolveIcpQualification } from "@/lib/scoring/icp-qualification";
import {
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
import {
  evaluatePersonaTitleGate,
  type TitleGateStatus,
} from "@/lib/scoring/title-fit";
import type {
  IcpSnapshot,
  PersonaSnapshot,
  ProductSnapshot,
} from "@/lib/scoring/types";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/org/authz";
import { recordUsageEvent } from "@/lib/usage/events";
import { TenantError } from "@/lib/tenant/getCurrentOrganization";
import { parseStringArray } from "@/lib/research";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import type { Prisma, ResearchStatus } from "@prisma/client";

export type ScoreContactResult = {
  contactScoreId: string;
  contactId: string;
  ok: boolean;
  error?: string;
};

export type PersonaAssessmentRecord = {
  personaId: string;
  personaName: string;
  gate: TitleGateStatus;
  reason: string;
  matchedTitle?: string;
  overallScore: number | null;
  personaScore: number | null;
  scoreLabel: string | null;
  aiCalled: boolean;
};

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

function unionCriteria(personas: PersonaSnapshot[]): CriterionSnapshot[] {
  const seen = new Set<string>();
  const out: CriterionSnapshot[] = [];
  for (const persona of personas) {
    for (const criterion of persona.criteria ?? []) {
      if (seen.has(criterion.id ?? `${criterion.name}:${criterion.sortOrder}`)) {
        continue;
      }
      seen.add(criterion.id ?? `${criterion.name}:${criterion.sortOrder}`);
      out.push(criterion);
    }
  }
  return out;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function scoreSingleContact(input: {
  organizationId: string;
  scoringRunId: string;
  contactScoreId: string;
  product: ProductSnapshot;
  icp: IcpSnapshot;
  persona: PersonaSnapshot;
  personas?: PersonaSnapshot[];
}): Promise<ScoreContactResult> {
  const personas =
    input.personas && input.personas.length > 0
      ? input.personas
      : [input.persona];
  const applyPositiveFit = personas.length > 1;

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

    const { resolveCompanyActualWithProvenance } =
      await import("@/lib/criteria/evaluate");
    const { evaluateIcpCriterionWithEvidenceClass } =
      await import("@/lib/criteria/targeted-search-eval");
    const criterionAssessments: Array<
      ReturnType<typeof evaluateIcpCriterionWithEvidenceClass>
    > = [];
    for (const criterion of input.icp.criteria ?? []) {
      const resolution = resolveCompanyActualWithProvenance(
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
              companySizeContext: latestResearch.companySizeContext,
              companySummary: latestResearch.companySummary,
              whatTheySell: latestResearch.whatTheySell,
              businessModel: latestResearch.businessModel,
            }
          : null,
      );
      criterionAssessments.push(
        evaluateIcpCriterionWithEvidenceClass({
          criterion,
          actualValue: resolution.provenance?.hedged ? null : resolution.value,
          provenance: resolution.provenance,
        }),
      );
    }

    const researchStatus: ResearchStatus =
      !latestResearch || latestResearch.status === "NOT_STARTED"
        ? "NOT_STARTED"
        : latestResearch.status === "FAILED"
          ? "FAILED"
          : latestResearch.status === "COMPLETED" ||
              latestResearch.status === "PARTIAL"
            ? "COMPLETED"
            : "IN_PROGRESS";

    const icpQualification = resolveIcpQualification({
      criteria: input.icp.criteria ?? [],
      assessments: criterionAssessments,
    });

    const gates = personas.map((persona) =>
      evaluatePersonaTitleGate({
        persona,
        contactTitle: contact.title,
        applyPositiveFit,
      }),
    );
    const gateById = new Map(gates.map((gate) => [gate.personaId, gate]));
    let candidatePersonas = personas.filter(
      (persona) => gateById.get(persona.id)?.status === "CANDIDATE",
    );

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
    if (candidatePersonas.length > 0) {
      try {
        const { getResearchPolicy } = await import("@/lib/usage/policy");
        const { researchContactRole } =
          await import("@/lib/contact-research/service");
        const policy = await getResearchPolicy(input.organizationId);
        const user = await getCurrentUser();
        const cr = await researchContactRole({
          organizationId: input.organizationId,
          contactId: contact.id,
          userId: user?.id ?? null,
          scoringRunId: input.scoringRunId,
          personaCriteria: unionCriteria(candidatePersonas),
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
        contactResearchRow = null;
      }
    }
    const contactResearch = toContactResearchInput(contactResearchRow);

    const assessments: PersonaAssessmentRecord[] = gates.map((gate) => ({
      personaId: gate.personaId,
      personaName: gate.personaName,
      gate: gate.status,
      reason: gate.reason,
      matchedTitle: gate.matchedTitle,
      overallScore: null,
      personaScore: null,
      scoreLabel: null,
      aiCalled: false,
    }));
    const assessmentById = new Map(
      assessments.map((row) => [row.personaId, row]),
    );

    if (contactResearch) {
      const stillCandidates: PersonaSnapshot[] = [];
      for (const persona of candidatePersonas) {
        const confirmed = evaluatePersonaExclusions({
          criteria: persona.criteria ?? [],
          title: contact.title,
          contactResearch,
        }).filter((row) => row.outcome === "CONFIRMED");
        if (confirmed.length > 0) {
          const row = assessmentById.get(persona.id);
          if (row) {
            row.gate = "EXCLUDED";
            row.reason = confirmed.map((item) => item.reasoning).join(" ");
            row.scoreLabel = "DISQUALIFIED";
          }
        } else {
          stillCandidates.push(persona);
        }
      }
      candidatePersonas = stillCandidates;
    }

    type ScoredPersona = {
      persona: PersonaSnapshot;
      calculated: ReturnType<typeof calculateScoresFromAssessment>;
      ai: Awaited<ReturnType<typeof generateScoringAssessment>>;
      exclusionAssessments: ReturnType<typeof evaluatePersonaExclusions>;
    };
    const scored: ScoredPersona[] = [];
    let lastAiError: string | null = null;

    for (const persona of candidatePersonas) {
      const exclusionAssessments = evaluatePersonaExclusions({
        criteria: persona.criteria ?? [],
        title: contact.title,
        contactResearch,
      });
      const titleConfirmed = exclusionAssessments.some(
        (row) =>
          row.testability === "TITLE_TESTABLE" && row.outcome === "CONFIRMED",
      );
      if (titleConfirmed) {
        const row = assessmentById.get(persona.id);
        if (row) {
          row.gate = "EXCLUDED";
          row.scoreLabel = "DISQUALIFIED";
        }
        continue;
      }

      try {
        const applicable = getApplicableDimensions({
          icp: input.icp,
          persona,
          product: input.product,
        });
        const { omitFactualIcpDimensionsForAi } =
          await import("@/lib/criteria/targeted-search-eval");
        const payload = buildScoringPayload({
          contact: {
            firstName: contact.firstName,
            lastName: contact.lastName,
            title: contact.title,
            company: contact.company,
            industry: contact.industry ?? company?.industry ?? null,
            employeeCount:
              contact.employeeCount ?? company?.employeeCount ?? null,
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
                revenue:
                  company.revenue != null ? String(company.revenue) : null,
                location: company.location,
              }
            : null,
          companyResearch: toResearchInput(latestResearch),
          contactResearch,
          product: input.product,
          icp: input.icp,
          persona,
          applicableDimensions: (() => {
            const forAi = omitFactualIcpDimensionsForAi(
              applicable,
              criterionAssessments,
            );
            return forAi.length > 0 ? forAi : applicable;
          })(),
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
          persona,
          contactResearch,
          personaExclusionAssessments: exclusionAssessments,
          criterionEvidenceAssessments: criterionAssessments,
        });
        const row = assessmentById.get(persona.id);
        if (row) {
          row.aiCalled = true;
          row.overallScore = calculated.overallScore;
          row.personaScore = calculated.personaScore;
          row.scoreLabel = calculated.scoreLabel;
        }
        if (calculated.scoreLabel === "DISQUALIFIED") {
          if (row) row.gate = "EXCLUDED";
          continue;
        }
        scored.push({
          persona,
          calculated,
          ai: aiResponse,
          exclusionAssessments,
        });
      } catch (error) {
        lastAiError =
          error instanceof Error ? error.message : "Unknown scoring failure.";
      }
    }

    const companyFields = {
      companySummary: latestResearch?.companySummary ?? null,
      whatTheySell: latestResearch?.whatTheySell ?? null,
      estimatedAov: latestResearch?.estimatedAov ?? null,
      aovReasoning: latestResearch?.aovReasoning ?? null,
      researchStatus,
      researchSources: latestResearch?.researchSources ?? undefined,
      researchedAt: latestResearch?.researchedAt ?? null,
      companyResearchId: latestResearch?.id ?? null,
      companyResearchAt: latestResearch?.researchedAt ?? null,
      contactResearchId: contactResearchRow?.id ?? null,
      contactResearchAt: contactResearchRow?.researchedAt ?? null,
      criterionAssessments: jsonValue(criterionAssessments),
      personaAssessments: jsonValue(assessments),
      scoringLogicVersion: SCORING_LOGIC_VERSION,
      scoredAt: new Date(),
      scoringError: null,
    };

    const hadCandidate = gates.some((gate) => gate.status === "CANDIDATE");
    const anyUnknown = assessments.some((row) => row.gate === "UNKNOWN");

    if (scored.length === 0) {
      if (hadCandidate && lastAiError && candidatePersonas.length > 0) {
        throw new Error(lastAiError);
      }
      const allExcluded = !anyUnknown;
      await prisma.contactScore.update({
        where: { id: scoreRow.id },
        data: {
          scoringStatus: "COMPLETED",
          overallScore: allExcluded ? 0 : null,
          icpScore: null,
          personaScore: allExcluded ? 0 : null,
          companyScore: null,
          productRelevanceScore: null,
          scoreLabel: allExcluded ? "DISQUALIFIED" : null,
          fitStrengths: [],
          fitRisks: assessments.map((row) => row.reason),
          disqualifiers: allExcluded
            ? assessments
                .filter((row) => row.gate === "EXCLUDED")
                .map((row) => ({
                  criterion: row.personaName,
                  evidence: [],
                  confidence: "HIGH",
                  scope: "PERSONA",
                }))
            : [],
          reasoning: allExcluded
            ? "Excluded against every persona in this run."
            : "Title did not match a selected persona. Needs review — not excluded.",
          recommendedAction: allExcluded
            ? "Exclude from this list."
            : "Needs review — title matched no persona.",
          ...companyFields,
          assessmentData: jsonValue({
            dimensions: [],
            unknownDimensionCount: 0,
            disqualifiers: [],
            criterionAssessments,
            icpQualification,
            personaAssessments: assessments,
            personaMatch: {
              status: allExcluded ? "EXCLUDED" : "UNKNOWN",
              matchedPersonaId: null,
            },
            aiSkipped: true,
            aiSkipReason: allExcluded
              ? "CONFIRMED_PERSONA_EXCLUSION"
              : "NO_TITLE_FIT",
          }),
          matchedPersonaId: null,
          aiProvider: null,
          aiModel: null,
          aiModelUrlIdentifier: null,
          promptVersion: null,
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
          reason: allExcluded
            ? "CONFIRMED_PERSONA_EXCLUSION"
            : "NO_TITLE_FIT",
          personaCount: personas.length,
          aiCalls: 0,
        },
      });
      return {
        contactScoreId: scoreRow.id,
        contactId: contact.id,
        ok: true,
      };
    }

    scored.sort((left, right) => {
      const overall =
        (right.calculated.overallScore ?? -1) -
        (left.calculated.overallScore ?? -1);
      if (overall !== 0) return overall;
      return (
        (right.calculated.personaScore ?? -1) -
        (left.calculated.personaScore ?? -1)
      );
    });
    const winner = scored[0]!;
    const inputTokens = scored.reduce(
      (sum, row) => sum + (row.ai.usage?.inputTokens ?? 0),
      0,
    );
    const outputTokens = scored.reduce(
      (sum, row) => sum + (row.ai.usage?.outputTokens ?? 0),
      0,
    );

    await prisma.contactScore.update({
      where: { id: scoreRow.id },
      data: {
        scoringStatus: "COMPLETED",
        overallScore: winner.calculated.overallScore,
        icpScore: winner.calculated.icpScore,
        personaScore: winner.calculated.personaScore,
        companyScore: winner.calculated.companyScore,
        productRelevanceScore: winner.calculated.productRelevanceScore,
        scoreLabel: winner.calculated.scoreLabel,
        fitStrengths: winner.calculated.fitStrengths,
        fitRisks: winner.calculated.fitRisks,
        disqualifiers: winner.calculated.disqualifiers,
        reasoning: winner.calculated.reasoning,
        recommendedAction: winner.calculated.recommendedAction,
        ...companyFields,
        assessmentData: jsonValue({
          dimensions: winner.calculated.dimensions,
          unknownDimensionCount: winner.calculated.unknownDimensionCount,
          componentCoverage: winner.calculated.componentCoverage,
          icpQualification: winner.calculated.icpQualification,
          fitStrengths: winner.calculated.fitStrengths,
          fitRisks: winner.calculated.fitRisks,
          disqualifiers: winner.calculated.disqualifiers,
          criterionAssessments,
          personaExclusionAssessments: winner.exclusionAssessments,
          personaAssessments: assessments,
          personaMatch: {
            status: "MATCHED",
            matchedPersonaId: winner.persona.id,
          },
          targetedSearchOutcomes: criterionAssessments
            .filter((row) => row.evidenceClass === "TARGETED_SEARCH")
            .map((row) => ({
              name: row.name,
              criterionId: row.criterionId ?? null,
              evidenceOutcome: row.evidenceOutcome,
              reasoning: row.reasoning,
            })),
        }),
        matchedPersonaId: winner.persona.id,
        matchedPersonaSnapshot: jsonValue(winner.persona),
        aiProvider: winner.ai.provider,
        aiModel: winner.ai.model,
        aiModelUrlIdentifier: winner.ai.modelUrlIdentifier,
        promptVersion: SCORING_PROMPT_VERSION,
      },
    });

    const user = await getCurrentUser();
    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: user?.id ?? null,
      category: "SCORING",
      operation: "CONTACT_SCORING",
      provider: winner.ai.provider,
      model: winner.ai.model,
      companyId: company?.id ?? null,
      contactId: contact.id,
      scoringRunId: input.scoringRunId,
      inputTokens: inputTokens || null,
      outputTokens: outputTokens || null,
      status: "SUCCESS",
      metadata: {
        personaCount: personas.length,
        aiCalls: scored.filter((row) => row).length,
        matchedPersonaId: winner.persona.id,
      },
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

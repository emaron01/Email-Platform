import type { PersonaAiDraft } from "@/lib/persona-research/contract";
import { listToCommaString } from "@/lib/utils";

export type PersonaProvenanceClass =
  | "CUSTOMER_EVIDENCE"
  | "WEB_EVIDENCE"
  | "MODEL_INFERENCE";

export type PersonaReviewSource = {
  id: string;
  sourceType: string;
  displayName: string;
  originalUrl?: string | null;
  filename?: string | null;
  provenanceClass?: string | null;
};

export type PersonaEvidenceRef = {
  claim: string;
  sourceIds?: string[];
  note?: string | null;
  provenanceClasses?: PersonaProvenanceClass[];
};

export type PersonaProvenanceAssessment = {
  claim: string;
  provenanceClasses: PersonaProvenanceClass[];
  note?: string | null;
};

export type PersonaBriefingView = {
  name: string;
  likelyTitles: string[];
  department: string | null;
  seniority: string | null;
  whoTheyAre: string | null;
  ownershipAreas: string[];
  responsibilities: string[];
  organizationalPressures: string[];
  painPoints: string[];
  kpisAndAccountabilities: string[];
  desiredOutcomes: string[];
  messagingNotes: string[];
  terminology: string[];
  personaSpecificPositioning: string[];
  proofPointsToEmphasize: string[];
  buyingRole: string | null;
  likelyObjections: string[];
};

export type PersonaCriterionBriefRow = {
  name: string;
  description?: string | null;
  criterionType: string;
  isDisqualifier?: boolean;
  isRequired?: boolean;
};

export type PersonaCriteriaBriefingGroups = {
  qualifies: PersonaCriterionBriefRow[];
  excludes: PersonaCriterionBriefRow[];
  needsReview: PersonaCriterionBriefRow[];
};

export const PERSONA_PROVENANCE_LABELS: Record<PersonaProvenanceClass, string> =
  {
    CUSTOMER_EVIDENCE: "Your materials",
    WEB_EVIDENCE: "Web research",
    MODEL_INFERENCE: "Disciplined inference",
  };

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function linesFromText(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function commaList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function provenanceLabelForClasses(
  classes: PersonaProvenanceClass[],
): string {
  if (classes.length === 0) return "Source";
  const first = PERSONA_PROVENANCE_LABELS[classes[0]!] ?? classes[0]!;
  if (classes.length === 1) return first;
  return `${first} +${classes.length - 1}`;
}

export function describePersonaSourceLead(input: {
  personaSources: PersonaReviewSource[];
  includesProductEvidence?: boolean;
  manualOnly?: boolean;
}): { sentence: string; names: string[] } {
  if (input.manualOnly && input.personaSources.length === 0) {
    return {
      sentence:
        "This persona was entered manually — no synthesis sources are recorded.",
      names: [],
    };
  }

  const names = input.personaSources.map((source) => {
    if (source.filename?.trim()) return source.filename.trim();
    if (source.displayName?.trim()) return source.displayName.trim();
    return source.sourceType;
  });

  const uploadCount = input.personaSources.filter(
    (s) => s.sourceType === "UPLOADED_DOCUMENT",
  ).length;
  const urlCount = input.personaSources.filter((s) => s.sourceType === "URL").length;
  const otherCount = input.personaSources.length - uploadCount - urlCount;

  const parts: string[] = [];
  if (input.includesProductEvidence) {
    parts.push("your approved product profile");
  }
  if (uploadCount > 0) {
    parts.push(
      `${uploadCount} uploaded document${uploadCount === 1 ? "" : "s"}`,
    );
  }
  if (urlCount > 0) {
    parts.push(`${urlCount} web source${urlCount === 1 ? "" : "s"}`);
  }
  if (otherCount > 0) {
    parts.push(`${otherCount} other source${otherCount === 1 ? "" : "s"}`);
  }

  if (parts.length === 0) {
    return {
      sentence: input.includesProductEvidence
        ? "Built from your approved product profile."
        : "No persona research sources are recorded yet.",
      names,
    };
  }

  return {
    sentence: `Built from ${parts.join(", ").replace(/, ([^,]*)$/, ", and $1")}.`,
    names,
  };
}

export function provenanceForClaim(input: {
  claim: string;
  evidenceRefs: PersonaEvidenceRef[];
  provenanceAssessments: PersonaProvenanceAssessment[];
}): PersonaProvenanceClass[] {
  const needle = normalize(input.claim);
  if (!needle) return [];

  const classes = new Set<PersonaProvenanceClass>();

  for (const ref of input.evidenceRefs) {
    const claim = normalize(ref.claim);
    if (!claim) continue;
    if (
      claim === needle ||
      claim.includes(needle) ||
      needle.includes(claim)
    ) {
      for (const c of ref.provenanceClasses ?? []) classes.add(c);
    }
  }

  for (const row of input.provenanceAssessments) {
    const claim = normalize(row.claim);
    if (!claim) continue;
    if (
      claim === needle ||
      claim.includes(needle) ||
      needle.includes(claim)
    ) {
      for (const c of row.provenanceClasses) classes.add(c);
    }
  }

  return [...classes];
}

export function sourceIdsForClaim(input: {
  claim: string;
  evidenceRefs: PersonaEvidenceRef[];
}): string[] {
  const needle = normalize(input.claim);
  if (!needle) return [];
  const ids = new Set<string>();
  for (const ref of input.evidenceRefs) {
    const claim = normalize(ref.claim);
    if (!claim) continue;
    if (
      claim === needle ||
      claim.includes(needle) ||
      needle.includes(claim)
    ) {
      for (const id of ref.sourceIds ?? []) ids.add(id);
    }
  }
  return [...ids];
}

export function resolvePersonaBriefingView(input: {
  name: string;
  definition?: string | null;
  responsibilities?: string | null;
  painPoints?: string | null;
  desiredOutcomes?: string | null;
  messagingNotes?: string | null;
  targetTitles?: unknown;
  department?: string | null;
  seniority?: string | null;
  profileJson?: unknown;
}): PersonaBriefingView {
  const profile =
    input.profileJson && typeof input.profileJson === "object"
      ? (input.profileJson as PersonaAiDraft)
      : null;

  const likelyTitles =
    profile?.likelyTitles?.length
      ? profile.likelyTitles
      : commaList(input.targetTitles);

  return {
    name: input.name,
    likelyTitles,
    department: profile?.departmentFunction ?? input.department ?? null,
    seniority: profile?.seniority ?? input.seniority ?? null,
    whoTheyAre:
      profile?.roleSummary?.trim() ||
      input.definition?.trim() ||
      input.responsibilities?.trim() ||
      null,
    ownershipAreas: profile?.ownershipAreas ?? [],
    responsibilities:
      profile?.primaryResponsibilities?.length
        ? profile.primaryResponsibilities
        : linesFromText(input.responsibilities),
    organizationalPressures: profile?.organizationalPressures ?? [],
    painPoints:
      profile?.painPoints?.length
        ? profile.painPoints
        : linesFromText(input.painPoints),
    kpisAndAccountabilities: profile?.kpisAndAccountabilities ?? [],
    desiredOutcomes:
      profile?.desiredOutcomesFromSolution?.length
        ? profile.desiredOutcomesFromSolution
        : linesFromText(input.desiredOutcomes),
    messagingNotes:
      profile?.messagingNotes?.length
        ? profile.messagingNotes
        : linesFromText(input.messagingNotes),
    terminology: profile?.terminology ?? [],
    personaSpecificPositioning: profile?.personaSpecificPositioning ?? [],
    proofPointsToEmphasize: profile?.proofPointsToEmphasize ?? [],
    buyingRole: profile?.buyingRole ?? null,
    likelyObjections: profile?.likelyObjections ?? [],
  };
}

export function groupPersonaCriteriaForBriefing(
  criteria: PersonaCriterionBriefRow[],
): PersonaCriteriaBriefingGroups {
  const qualifies: PersonaCriterionBriefRow[] = [];
  const excludes: PersonaCriterionBriefRow[] = [];
  const needsReview: PersonaCriterionBriefRow[] = [];

  for (const row of criteria) {
    const type = row.criterionType.trim().toLowerCase();
    if (type === "needs_review") {
      needsReview.push(row);
      continue;
    }
    if (row.isDisqualifier) {
      excludes.push(row);
      continue;
    }
    qualifies.push(row);
  }

  return { qualifies, excludes, needsReview };
}

export function formatPersonaBriefingMeta(input: {
  likelyTitles: string[];
  department: string | null;
  seniority: string | null;
}): string {
  return [
    input.likelyTitles.length > 0
      ? listToCommaString(input.likelyTitles)
      : null,
    input.department,
    input.seniority,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function readProvenanceFromProfile(
  profileJson: unknown,
): {
  evidenceRefs: PersonaEvidenceRef[];
  provenanceAssessments: PersonaProvenanceAssessment[];
} {
  if (!profileJson || typeof profileJson !== "object") {
    return { evidenceRefs: [], provenanceAssessments: [] };
  }
  const profile = profileJson as PersonaAiDraft;
  return {
    evidenceRefs: (profile.evidenceRefs ?? []) as PersonaEvidenceRef[],
    provenanceAssessments: (profile.provenanceAssessments ??
      []) as PersonaProvenanceAssessment[],
  };
}

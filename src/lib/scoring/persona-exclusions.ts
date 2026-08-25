import type { CriterionSnapshot } from "@/lib/criteria/types";
import type { ScoringContactResearchInput } from "@/lib/scoring/payload";
import {
  CONFIDENCE_MODIFIER,
  DISQUALIFIER_MIN_CONFIDENCE,
  type ConfidenceValue,
} from "@/lib/scoring/config";

export type PersonaExclusionOutcome = "CONFIRMED" | "NOT_CONFIRMED" | "UNKNOWN";

export type PersonaExclusionAssessment = {
  scope: "PERSONA";
  criterionId?: string;
  criterion: string;
  testability: "TITLE_TESTABLE" | "EVIDENCE_TESTABLE";
  outcome: PersonaExclusionOutcome;
  evidence: string[];
  confidence: ConfidenceValue;
  reasoning: string;
  excludeFromScore: true;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function criterionText(criterion: CriterionSnapshot): string {
  const target = Array.isArray(criterion.targetValue)
    ? criterion.targetValue.join(" ")
    : typeof criterion.targetValue === "string"
      ? criterion.targetValue
      : "";
  return normalize(
    [criterion.name, criterion.description, criterion.researchGuidance, target]
      .filter(Boolean)
      .join(" "),
  );
}

const TITLE_CATEGORY_MATCHERS: Array<{
  title: RegExp;
  criterion: RegExp;
}> = [
  {
    title: /\b(account executive|sales representative|sales rep)\b/,
    criterion: /\b(account executive|individual sell|sales representative)\b/,
  },
  {
    title: /\b(sdr|sales development representative)\b/,
    criterion: /\b(sdr|sales development|individual sell)\b/,
  },
  {
    title: /\b(bdr|business development representative)\b/,
    criterion: /\b(bdr|business development|individual sell)\b/,
  },
  {
    title: /\b(crm|salesforce)\s+(administrator|admin)\b/,
    criterion: /\b(crm|salesforce)\s+(administrator|admin)\b/,
  },
  {
    title: /\bmarketing operations\b/,
    criterion: /\bmarketing operations\b/,
  },
  {
    title: /\b(finance|fp and a|financial planning)\b/,
    criterion: /\b(finance|fp and a|financial planning)\b/,
  },
  {
    title: /\b(front line )?sales manager\b/,
    criterion: /\b(front line )?sales manager\b/,
  },
  {
    title: /\b(cro|chief revenue officer)\b/,
    criterion: /\b(cro|chief revenue officer|revenue engine executive)\b/,
  },
];

function titleConfirmsExclusion(
  title: string,
  criterion: CriterionSnapshot,
): boolean {
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) return false;
  const text = criterionText(criterion);
  if (text.includes(normalizedTitle)) return true;

  const roleCore = normalizedTitle
    .replace(
      /^(chief|senior|sr|executive|evp|svp|vp|vice president|head of|director of)\s+/,
      "",
    )
    .trim();
  if (roleCore.length >= 5 && text.includes(roleCore)) return true;

  return TITLE_CATEGORY_MATCHERS.some(
    (matcher) =>
      matcher.title.test(normalizedTitle) && matcher.criterion.test(text),
  );
}

function confidenceMeetsEvidenceBar(
  confidence: string | null | undefined,
): confidence is ConfidenceValue {
  if (
    confidence !== "HIGH" &&
    confidence !== "MEDIUM" &&
    confidence !== "LOW"
  ) {
    return false;
  }
  return (
    CONFIDENCE_MODIFIER[confidence] >=
    CONFIDENCE_MODIFIER[DISQUALIFIER_MIN_CONFIDENCE]
  );
}

function evidenceSignalMatches(
  signal: string,
  criterion: CriterionSnapshot,
): boolean {
  const normalizedSignal = normalize(signal);
  const text = criterionText(criterion);
  if (!normalizedSignal || !text) return false;
  if (text.includes(normalizedSignal) || normalizedSignal.includes(text)) {
    return true;
  }

  const meaningful = new Set(
    text
      .split(" ")
      .filter(
        (token) =>
          token.length >= 4 &&
          !["only", "role", "whose", "without", "focused"].includes(token),
      ),
  );
  const signalTokens = new Set(normalizedSignal.split(" "));
  const overlap = [...meaningful].filter((token) => signalTokens.has(token));
  return meaningful.size >= 3 && overlap.length / meaningful.size >= 0.6;
}

export function evaluatePersonaExclusions(input: {
  criteria: CriterionSnapshot[];
  title: string | null;
  contactResearch: ScoringContactResearchInput;
}): PersonaExclusionAssessment[] {
  return input.criteria
    .filter(
      (
        criterion,
      ): criterion is CriterionSnapshot & {
        exclusionTestability: "TITLE_TESTABLE" | "EVIDENCE_TESTABLE";
      } =>
        criterion.isDisqualifier &&
        (criterion.exclusionTestability === "TITLE_TESTABLE" ||
          criterion.exclusionTestability === "EVIDENCE_TESTABLE"),
    )
    .map((criterion) => {
      if (criterion.exclusionTestability === "TITLE_TESTABLE") {
        if (!input.title?.trim()) {
          return {
            scope: "PERSONA",
            criterionId: criterion.id,
            criterion: criterion.name,
            testability: criterion.exclusionTestability,
            outcome: "UNKNOWN",
            evidence: [],
            confidence: "LOW",
            reasoning: "No contact title is available to test this exclusion.",
            excludeFromScore: true,
          };
        }
        const confirmed = titleConfirmsExclusion(input.title, criterion);
        return {
          scope: "PERSONA",
          criterionId: criterion.id,
          criterion: criterion.name,
          testability: criterion.exclusionTestability,
          outcome: confirmed ? "CONFIRMED" : "NOT_CONFIRMED",
          evidence: confirmed ? [`Contact title: ${input.title}`] : [],
          confidence: "HIGH",
          reasoning: confirmed
            ? `Contact title confirms persona exclusion "${criterion.name}".`
            : `Contact title does not confirm persona exclusion "${criterion.name}".`,
          excludeFromScore: true,
        };
      }

      const research = input.contactResearch;
      if (
        !research ||
        !confidenceMeetsEvidenceBar(research.confidence) ||
        (research.status !== "COMPLETED" && research.status !== "PARTIAL")
      ) {
        return {
          scope: "PERSONA",
          criterionId: criterion.id,
          criterion: criterion.name,
          testability: criterion.exclusionTestability,
          outcome: "UNKNOWN",
          evidence: [],
          confidence: "LOW",
          reasoning:
            "No sufficiently confident contact evidence is available for this exclusion.",
          excludeFromScore: true,
        };
      }

      const matchingSignals = research.negativeRoleSignals.filter((signal) =>
        evidenceSignalMatches(signal, criterion),
      );
      return {
        scope: "PERSONA",
        criterionId: criterion.id,
        criterion: criterion.name,
        testability: criterion.exclusionTestability,
        outcome: matchingSignals.length > 0 ? "CONFIRMED" : "NOT_CONFIRMED",
        evidence: matchingSignals,
        confidence: research.confidence,
        reasoning:
          matchingSignals.length > 0
            ? `Contact research confirms persona exclusion "${criterion.name}".`
            : `Contact research does not confirm persona exclusion "${criterion.name}".`,
        excludeFromScore: true,
      };
    });
}

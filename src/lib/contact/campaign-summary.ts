import type { ContactScoringStatus, QualificationBucket } from "@prisma/client";
import {
  readExclusionDetails,
  type ExclusionDetail,
} from "@/lib/scoring/exclusion-detail";
import {
  firstUnresolvedCriterion,
  firstUnresolvedDimension,
  QUALIFICATION_BUCKET_LABELS,
  readQualificationReason,
  scoreLabelToBucket,
} from "@/lib/workflow/qualification";

export type ContactCampaignQualification = {
  bucket: QualificationBucket;
  statusDetail: string | null;
};

export type ContactCampaignLineInput = {
  campaignName: string;
  bucket: QualificationBucket | null;
  statusDetail: string | null;
  sentCount: number;
};

/**
 * Confirmed sends only: {@link EmailDraft} rows with `status === "SENT"`.
 * That includes mark-as-sent (`MANUAL_ASSERTION`), connected mailbox send
 * (`CONNECTED_PROVIDER`), and mark-as-sent after an email-client handoff.
 * Does not count generated drafts, `DEEPLINK_INTENT` handoffs alone, or
 * in-progress `SENDING` rows.
 */
export function countConfirmedSends(
  drafts: ReadonlyArray<{ status: string }>,
): number {
  return drafts.filter((draft) => draft.status === "SENT").length;
}

export function resolveContactCampaignQualification(input: {
  scoringStatus: ContactScoringStatus;
  scoreLabel: Parameters<typeof scoreLabelToBucket>[0];
  assessmentData: unknown;
  criterionAssessments: unknown;
  matchedPersonaName: string | null;
  overrideBucket: QualificationBucket | null;
}): ContactCampaignQualification {
  const suppressed = input.scoringStatus === "SUPPRESSED";
  const unresolved = suppressed
    ? null
    : firstUnresolvedCriterion(input.criterionAssessments) ??
      firstUnresolvedDimension(input.assessmentData);
  const inferred = suppressed
    ? "EXCLUDED"
    : scoreLabelToBucket(input.scoreLabel, input.assessmentData);
  const bucket = input.overrideBucket ?? inferred;
  const exclusionDetails =
    bucket === "EXCLUDED"
      ? readExclusionDetails(input.assessmentData)
      : [];

  const statusDetail = buildContactCampaignStatusDetail({
    bucket,
    suppressed,
    assessmentData: input.assessmentData,
    matchedPersonaName: input.matchedPersonaName,
    unresolvedCriterion: suppressed
      ? "Opted out — organization-wide suppression. Cannot be scored or emailed."
      : unresolved
        ? `${unresolved.reasoning.replace(/[.]+$/, "")} · Research this contact`
        : bucket === "NEEDS_REVIEW"
          ? "Qualification is incomplete · Review this contact"
          : null,
    exclusionDetails,
  });

  return { bucket, statusDetail };
}

function buildContactCampaignStatusDetail(input: {
  bucket: QualificationBucket;
  suppressed: boolean;
  assessmentData: unknown;
  matchedPersonaName: string | null;
  unresolvedCriterion: string | null;
  exclusionDetails: ExclusionDetail[];
}): string | null {
  if (input.bucket === "GOOD") {
    return input.matchedPersonaName;
  }

  if (input.bucket === "EXCLUDED") {
    if (input.suppressed) {
      return "organization-wide suppression";
    }
    const detail = input.exclusionDetails[0];
    if (detail) {
      if (detail.kind === "ICP") {
        return detail.comparison.trim() || detail.criterionName;
      }
      return detail.criterionName;
    }
    return readQualificationReason(input.assessmentData);
  }

  if (input.bucket === "NEEDS_REVIEW" || input.bucket === "POOR_FIT") {
    if (input.unresolvedCriterion) {
      return input.unresolvedCriterion
        .replace(/ · Research this contact$/, "")
        .replace(/ · Review this contact$/, "");
    }
    return readQualificationReason(input.assessmentData);
  }

  return null;
}

function qualificationLabel(bucket: QualificationBucket): string {
  if (bucket === "POOR_FIT") {
    return QUALIFICATION_BUCKET_LABELS.NEEDS_REVIEW;
  }
  return QUALIFICATION_BUCKET_LABELS[bucket];
}

function formatStatusSegment(
  bucket: QualificationBucket,
  statusDetail: string | null,
): string {
  const label = qualificationLabel(bucket);
  if (bucket === "GOOD" && statusDetail) {
    return `${label} · ${statusDetail}`;
  }
  if (
    (bucket === "NEEDS_REVIEW" ||
      bucket === "POOR_FIT" ||
      bucket === "EXCLUDED") &&
    statusDetail
  ) {
    return `${label}, ${statusDetail}`;
  }
  return label;
}

export function formatContactCampaignLine(
  input: ContactCampaignLineInput,
): string {
  const status =
    input.bucket == null
      ? "Not scored for this campaign"
      : formatStatusSegment(input.bucket, input.statusDetail);
  const sentLabel =
    input.sentCount === 1 ? "1 sent" : `${input.sentCount} sent`;
  return `${input.campaignName} · ${status} · ${sentLabel}`;
}

export function formatSentCountLabel(sentCount: number): string {
  return sentCount === 1 ? "1 sent" : `${sentCount} sent`;
}

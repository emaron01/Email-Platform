import { describe, expect, it } from "vitest";
import {
  contactDraftListStatus,
  isLookaheadEligible,
  LOOKAHEAD_DRAFT_COUNT,
  pickLookaheadContacts,
} from "@/lib/campaign/email-draft-lookahead";

describe("email draft lookahead", () => {
  it("exports a tunable look-ahead count", () => {
    expect(LOOKAHEAD_DRAFT_COUNT).toBe(2);
  });

  it("picks the next eligible contacts after the current one", () => {
    const contacts = [
      {
        campaignContactId: "a",
        contactStatus: "SELECTED",
        suppressed: false,
        sequenceStopped: false,
        hasPersonaDecision: true,
        drafts: [{ sequenceNumber: 1, subject: "Hi", body: "Body", status: "DRAFT" }],
      },
      {
        campaignContactId: "b",
        contactStatus: "SELECTED",
        suppressed: false,
        sequenceStopped: false,
        hasPersonaDecision: true,
        drafts: [],
      },
      {
        campaignContactId: "c",
        contactStatus: "EXCLUDED",
        suppressed: false,
        sequenceStopped: false,
        hasPersonaDecision: true,
        drafts: [],
      },
      {
        campaignContactId: "d",
        contactStatus: "SELECTED",
        suppressed: true,
        sequenceStopped: false,
        hasPersonaDecision: true,
        drafts: [],
      },
      {
        campaignContactId: "e",
        contactStatus: "SELECTED",
        suppressed: false,
        sequenceStopped: false,
        hasPersonaDecision: true,
        drafts: [],
      },
      {
        campaignContactId: "f",
        contactStatus: "SELECTED",
        suppressed: false,
        sequenceStopped: false,
        hasPersonaDecision: true,
        drafts: [],
      },
    ];

    expect(pickLookaheadContacts(contacts, "a").map((row) => row.campaignContactId)).toEqual([
      "b",
      "e",
    ]);
  });

  it("skips contacts that already have drafts", () => {
    expect(
      isLookaheadEligible({
        campaignContactId: "x",
        contactStatus: "SELECTED",
        suppressed: false,
        sequenceStopped: false,
        hasPersonaDecision: true,
        drafts: [{ sequenceNumber: 1, subject: "Hi", body: "Body", status: "DRAFT" }],
      }),
    ).toBe(false);
  });

  it("skips contacts without a persona decision", () => {
    expect(
      isLookaheadEligible({
        campaignContactId: "x",
        contactStatus: "SELECTED",
        suppressed: false,
        sequenceStopped: false,
        hasPersonaDecision: false,
        drafts: [],
      }),
    ).toBe(false);
  });

  it("labels contacts that still need a persona decision", () => {
    expect(
      contactDraftListStatus({
        isPreparing: false,
        hasPersonaDecision: false,
        drafts: [],
      }),
    ).toBe("Needs persona");
  });

  it("labels prepared drafts without implying the rep requested them", () => {
    expect(
      contactDraftListStatus({
        isPreparing: false,
        drafts: [
          {
            subject: "Hi",
            body: "Body",
            status: "DRAFT",
            source: "AI_LOOKAHEAD",
            generationQuotaCommitted: false,
          },
        ],
      }),
    ).toBe("Prepared");
    expect(
      contactDraftListStatus({
        isPreparing: false,
        drafts: [
          {
            subject: "Hi",
            body: "Body",
            status: "DRAFT",
            source: "AI",
            generationQuotaCommitted: true,
          },
        ],
      }),
    ).toBe("Ready to review");
  });
});

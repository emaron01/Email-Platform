import { describe, expect, it } from "vitest";
import { sortEmailDraftContactsForSendQueue } from "@/lib/campaign/email-draft-contact-order";

describe("sortEmailDraftContactsForSendQueue", () => {
  it("keeps unsent and no-draft contacts first, fully sent last, stable within groups", () => {
    const contacts = [
      { id: "sent-a", drafts: [{ status: "SENT" }] },
      { id: "none", drafts: [] },
      { id: "draft-b", drafts: [{ status: "DRAFT" }] },
      { id: "sent-c", drafts: [{ status: "SENT" }, { status: "SENT" }] },
      { id: "mixed", drafts: [{ status: "SENT" }, { status: "DRAFT" }] },
      { id: "sending", drafts: [{ status: "SENDING" }] },
    ];

    expect(sortEmailDraftContactsForSendQueue(contacts).map((c) => c.id)).toEqual([
      "none",
      "draft-b",
      "mixed",
      "sending",
      "sent-a",
      "sent-c",
    ]);
  });
});

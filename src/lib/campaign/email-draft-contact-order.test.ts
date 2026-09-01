import { describe, expect, it } from "vitest";
import {
  isSendQueueActionable,
  pickNextContactAfterSend,
  sortEmailDraftContactsForSendQueue,
} from "@/lib/campaign/email-draft-contact-order";

describe("sortEmailDraftContactsForSendQueue", () => {
  it("orders unsent-with-draft, unsent-without-draft, then sent, stable within groups", () => {
    const contacts = [
      { id: "sent-a", campaignContactId: "sent-a", contactStatus: "SELECTED", suppressed: false, drafts: [{ status: "SENT", subject: "Hi", body: "Body" }] },
      { id: "none", campaignContactId: "none", contactStatus: "SELECTED", suppressed: false, drafts: [] },
      { id: "draft-b", campaignContactId: "draft-b", contactStatus: "SELECTED", suppressed: false, drafts: [{ status: "DRAFT", subject: "Hi", body: "Body" }] },
      { id: "sent-c", campaignContactId: "sent-c", contactStatus: "SELECTED", suppressed: false, drafts: [{ status: "SENT", subject: "A", body: "B" }, { status: "SENT", subject: "C", body: "D" }] },
      { id: "mixed", campaignContactId: "mixed", contactStatus: "SELECTED", suppressed: false, drafts: [{ status: "SENT", subject: "A", body: "B" }, { status: "DRAFT", subject: "Hi", body: "Body" }] },
      { id: "sending", campaignContactId: "sending", contactStatus: "SELECTED", suppressed: false, drafts: [{ status: "SENDING", subject: "Hi", body: "Body" }] },
    ];

    expect(sortEmailDraftContactsForSendQueue(contacts).map((c) => c.id)).toEqual([
      "draft-b",
      "mixed",
      "sending",
      "none",
      "sent-a",
      "sent-c",
    ]);
  });
});

describe("pickNextContactAfterSend", () => {
  const contacts = [
    { campaignContactId: "a", contactStatus: "SELECTED", suppressed: false, drafts: [{ status: "DRAFT", subject: "Hi", body: "Body" }] },
    { campaignContactId: "b", contactStatus: "EXCLUDED", suppressed: false, drafts: [] },
    { campaignContactId: "c", contactStatus: "SELECTED", suppressed: false, drafts: [{ status: "DRAFT", subject: "Hi", body: "Body" }] },
    { campaignContactId: "d", contactStatus: "SELECTED", suppressed: true, drafts: [] },
    { campaignContactId: "e", contactStatus: "SELECTED", suppressed: false, drafts: [] },
  ];

  it("skips excluded, suppressed, and already-sent contacts", () => {
    expect(isSendQueueActionable(contacts[1])).toBe(false);
    expect(isSendQueueActionable(contacts[3])).toBe(false);
    expect(pickNextContactAfterSend(contacts, "a")?.campaignContactId).toBe("c");
    expect(pickNextContactAfterSend(contacts, "c")?.campaignContactId).toBe("e");
    expect(pickNextContactAfterSend(contacts, "e")).toBeNull();
  });
});

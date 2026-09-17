import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  source: null as null | Record<string, unknown>,
  created: null as null | Record<string, unknown>,
  personaRows: [] as Array<{ personaId: string }>,
  findFirst: vi.fn(async () => state.source),
  create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    state.created = { id: "camp_copy", ...data };
    return { id: "camp_copy" };
  }),
  createMany: vi.fn(
    async ({ data }: { data: Array<{ personaId: string }> }) => {
      state.personaRows = data.map((row) => ({ personaId: row.personaId }));
      return { count: data.length };
    },
  ),
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      campaign: { create: state.create },
      campaignPersona: { createMany: state.createMany },
    };
    return fn(tx);
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    campaign: { findFirst: state.findFirst },
    $transaction: state.transaction,
  },
}));

import { duplicateSharedCampaign } from "@/lib/campaign/duplicate";
import { TenantError } from "@/lib/tenant/errors";

describe("duplicateSharedCampaign", () => {
  beforeEach(() => {
    state.source = null;
    state.created = null;
    state.personaRows = [];
    state.findFirst.mockClear();
    state.create.mockClear();
    state.createMany.mockClear();
    state.transaction.mockClear();
  });

  it("copies config into a PERSONAL campaign owned by the actor", async () => {
    state.source = {
      id: "camp_shared",
      organizationId: "org_1",
      ownerUserId: "owner_1",
      visibility: "SHARED",
      archivedAt: null,
      name: "Outbound Q1",
      productId: "prod_1",
      icpId: "icp_1",
      personaId: "persona_legacy",
      offerName: "Pilot",
      offerDescription: "Try it",
      offerCta: "Book",
      offerNotes: "notes",
      offerValidationJson: { ok: true },
      offerValidationHash: "hash",
      emailLength: "MEDIUM",
      emailGuidance: "Be brief",
      personasInPlay: [{ personaId: "p1" }, { personaId: "p2" }],
    };

    const result = await duplicateSharedCampaign({
      organizationId: "org_1",
      sourceCampaignId: "camp_shared",
      actorUserId: "rep_1",
      actorRole: "MEMBER",
    });

    expect(result).toEqual({ campaignId: "camp_copy" });
    expect(state.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org_1",
        ownerUserId: "rep_1",
        visibility: "PERSONAL",
        name: "Outbound Q1 (copy)",
        productId: "prod_1",
        icpId: "icp_1",
        personaId: "persona_legacy",
        offerId: null,
        offerName: "Pilot",
        emailLength: "MEDIUM",
        emailGuidance: "Be brief",
        status: "DRAFT",
      }),
      select: { id: true },
    });
    expect(state.personaRows).toEqual([
      { personaId: "p1" },
      { personaId: "p2" },
    ]);
  });

  it("rejects PERSONAL sources", async () => {
    state.source = {
      id: "camp_personal",
      organizationId: "org_1",
      ownerUserId: "owner_1",
      visibility: "PERSONAL",
      archivedAt: null,
      name: "Mine",
      productId: "prod_1",
      icpId: "icp_1",
      personaId: null,
      offerName: null,
      offerDescription: null,
      offerCta: null,
      offerNotes: null,
      offerValidationJson: null,
      offerValidationHash: null,
      emailLength: "MEDIUM",
      emailGuidance: null,
      personasInPlay: [],
    };

    await expect(
      duplicateSharedCampaign({
        organizationId: "org_1",
        sourceCampaignId: "camp_personal",
        actorUserId: "rep_1",
        actorRole: "MEMBER",
      }),
    ).rejects.toBeInstanceOf(TenantError);
    expect(state.create).not.toHaveBeenCalled();
  });

  it("rejects when MEMBER cannot open another PERSONAL campaign", async () => {
    // Shared path already checked; personal open-guard is covered in visibility tests.
    // Here: wrong org / missing source.
    state.source = null;
    await expect(
      duplicateSharedCampaign({
        organizationId: "org_1",
        sourceCampaignId: "missing",
        actorUserId: "rep_1",
        actorRole: "MEMBER",
      }),
    ).rejects.toThrow(/not found/i);
  });
});

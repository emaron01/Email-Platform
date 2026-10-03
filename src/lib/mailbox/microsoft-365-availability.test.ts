import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BILLING_PLAN_COMPED,
  BILLING_PLAN_ENTERPRISE,
  BILLING_PLAN_PREMIUM,
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
} from "@/lib/billing/plans";
import {
  isMicrosoft365SendingAvailable,
  MICROSOFT_365_SENDING_PLAN_MESSAGE,
} from "@/lib/mailbox/availability";

const state = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationBillingProfile: {
      findUnique: state.findUnique,
      update: state.update,
    },
  },
}));

vi.mock("@/lib/auth/audit", () => ({
  recordAdminAuditEvent: (...args: unknown[]) => state.audit(...args),
}));

vi.mock("@/lib/billing/stripe", () => ({
  stripeConfigured: () => false,
  getStripe: () => {
    throw new Error("Stripe is not used by the Microsoft 365 switch.");
  },
}));

import { updateOrganizationMicrosoft365SendingAsPlatform } from "@/lib/platform/orgs";

describe("Microsoft 365 sending availability", () => {
  it("stays off for Standard even if the stored flag is on", () => {
    expect(
      isMicrosoft365SendingAvailable({
        planCode: BILLING_PLAN_STANDARD,
        enabled: false,
      }),
    ).toBe(false);
    expect(
      isMicrosoft365SendingAvailable({
        planCode: BILLING_PLAN_STANDARD,
        enabled: true,
      }),
    ).toBe(false);
    expect(
      isMicrosoft365SendingAvailable({
        planCode: BILLING_PLAN_COMPED,
        enabled: true,
      }),
    ).toBe(false);
    expect(
      isMicrosoft365SendingAvailable({
        planCode: "FREE",
        enabled: true,
      }),
    ).toBe(false);
  });

  it("stays off for Team and Enterprise until the flag is on, then appears", () => {
    expect(
      isMicrosoft365SendingAvailable({
        planCode: BILLING_PLAN_TEAM,
        enabled: false,
      }),
    ).toBe(false);
    expect(
      isMicrosoft365SendingAvailable({
        planCode: BILLING_PLAN_ENTERPRISE,
        enabled: false,
      }),
    ).toBe(false);
    expect(
      isMicrosoft365SendingAvailable({
        planCode: BILLING_PLAN_TEAM,
        enabled: true,
      }),
    ).toBe(true);
    expect(
      isMicrosoft365SendingAvailable({
        planCode: BILLING_PLAN_ENTERPRISE,
        enabled: true,
      }),
    ).toBe(true);
    expect(
      isMicrosoft365SendingAvailable({
        planCode: BILLING_PLAN_PREMIUM,
        enabled: true,
      }),
    ).toBe(true);
  });
});

describe("updateOrganizationMicrosoft365SendingAsPlatform", () => {
  beforeEach(() => {
    state.findUnique.mockReset();
    state.update.mockReset();
    state.audit.mockReset();
    state.update.mockResolvedValue({});
    state.audit.mockResolvedValue(undefined);
  });

  it("lets a platform operator turn it on for Team and Enterprise", async () => {
    state.findUnique.mockResolvedValue({
      planCode: BILLING_PLAN_TEAM,
      microsoft365SendingEnabled: false,
    });
    await updateOrganizationMicrosoft365SendingAsPlatform({
      organizationId: "org_team",
      actorUserId: "admin_1",
      enabled: true,
    });
    expect(state.update).toHaveBeenCalledWith({
      where: { organizationId: "org_team" },
      data: { microsoft365SendingEnabled: true },
    });
    expect(state.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PLATFORM_USAGE_POLICY_CHANGED",
        organizationId: "org_team",
        metadata: expect.objectContaining({
          microsoft365SendingEnabled: true,
          scope: "microsoft_365_sending",
        }),
      }),
    );

    state.findUnique.mockResolvedValue({
      planCode: BILLING_PLAN_ENTERPRISE,
      microsoft365SendingEnabled: false,
    });
    await updateOrganizationMicrosoft365SendingAsPlatform({
      organizationId: "org_ent",
      actorUserId: "admin_1",
      enabled: true,
    });
    expect(state.update).toHaveBeenLastCalledWith({
      where: { organizationId: "org_ent" },
      data: { microsoft365SendingEnabled: true },
    });
  });

  it("refuses to turn it on for a Standard organization", async () => {
    state.findUnique.mockResolvedValue({
      planCode: BILLING_PLAN_STANDARD,
      microsoft365SendingEnabled: false,
    });
    await expect(
      updateOrganizationMicrosoft365SendingAsPlatform({
        organizationId: "org_std",
        actorUserId: "admin_1",
        enabled: true,
      }),
    ).rejects.toThrow(MICROSOFT_365_SENDING_PLAN_MESSAGE);
    expect(state.update).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });
});

describe("Microsoft 365 surfaces stay gated and handoff stays", () => {
  const workspace = readFileSync(
    "src/components/EmailSequenceWorkspace.tsx",
    "utf8",
  );
  const emailSettings = readFileSync(
    "src/app/(app)/settings/email/page.tsx",
    "utf8",
  );
  const connect = readFileSync(
    "src/app/api/mailbox/microsoft/connect/route.ts",
    "utf8",
  );
  const callback = readFileSync(
    "src/app/api/mailbox/microsoft/callback/route.ts",
    "utf8",
  );
  const send = readFileSync("src/lib/mailbox/send.ts", "utf8");
  const platform = readFileSync(
    "src/app/platform/orgs/[id]/page.tsx",
    "utf8",
  );
  const platformAction = readFileSync(
    "src/app/actions/platform-orgs.ts",
    "utf8",
  );

  it("shows Send with Microsoft 365 and the mailbox panel only when the switch is on", () => {
    const handoff = workspace.indexOf("EMAIL_CLIENT_OPTIONS.map");
    const gate = workspace.indexOf("microsoft365SendingAvailable", handoff);
    const sendButton = workspace.indexOf("Send with Microsoft 365", handoff);
    expect(handoff).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(handoff);
    expect(sendButton).toBeGreaterThan(gate);
    expect(workspace).toContain('data-testid="send-with-microsoft-365"');
    expect(workspace).toContain('data-testid="connect-microsoft-365"');
    expect(workspace).toContain("I sent this — mark as sent");
    expect(workspace).toContain("Open in {option.label}");
    expect(emailSettings).toContain("access.available ? (");
    expect(emailSettings).toContain("<MailboxConnectionPanel");
    expect(emailSettings).toContain("EmailSignatureForm");
    expect(platform).toContain('testId="platform-microsoft-365-form"');
    expect(platform).toContain("{canMutate ? (");
    expect(platformAction).toContain("requirePlatformSuperAdmin");
    expect(platformAction).toContain("updatePlatformMicrosoft365SendingAction");
  });

  it("refuses connect, callback, and connected send while the switch is off", () => {
    expect(connect.indexOf("await getMicrosoft365SendingAccess")).toBeLessThan(
      connect.indexOf("await beginMicrosoftMailboxConnection"),
    );
    expect(connect).toContain("if (!access.available)");
    expect(callback.indexOf("await getMicrosoft365SendingAccess")).toBeLessThan(
      callback.indexOf("await completeMicrosoftMailboxConnection"),
    );
    expect(callback).toContain("if (!access.available)");
    expect(send.indexOf("assertMicrosoft365SendingAvailable")).toBeLessThan(
      send.indexOf("reserveDailyEmailSend"),
    );
  });
});

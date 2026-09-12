/**
 * Org settings must not let customers edit platform entitlements.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("organization settings entitlement lock", () => {
  it("shows usage/research/overrides as read-only (no save forms)", () => {
    const page = readFileSync(
      "src/app/(app)/settings/organization/page.tsx",
      "utf8",
    );
    expect(page).toContain("usage-policy-readonly");
    expect(page).toContain("research-policy-readonly");
    expect(page).toContain("user-overrides-readonly");
    expect(page).not.toContain("updateOrganizationUsagePolicyAction");
    expect(page).not.toContain("updateResearchPolicyAction");
    expect(page).not.toContain("upsertUserUsageOverrideAction");
    expect(page).not.toContain("Save usage policy");
    expect(page).not.toContain("Save research policy");
    expect(page).not.toContain("Save override");
    // Workspace + timezone remain editable.
    expect(page).toContain("renameWorkspaceAction");
    expect(page).toContain("updateOrganizationTimezoneAction");
  });

  it("gates entitlement save actions behind platform super admin", () => {
    const actions = readFileSync("src/app/actions/settings.ts", "utf8");
    for (const name of [
      "updateOrganizationUsagePolicyAction",
      "updateResearchPolicyAction",
      "upsertUserUsageOverrideAction",
    ]) {
      const start = actions.indexOf(`export async function ${name}`);
      expect(start).toBeGreaterThan(-1);
      const next = actions.indexOf("export async function", start + 1);
      const body = actions.slice(start, next === -1 ? undefined : next);
      expect(body).toContain("requirePlatformSuperAdmin");
    }
  });
});

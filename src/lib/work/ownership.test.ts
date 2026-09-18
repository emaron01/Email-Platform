import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canModifyOwnedWork,
  canViewOwnedWork,
} from "@/lib/work/ownership";

describe("personal work ownership", () => {
  it("lets managers view another rep's work but never modify it", () => {
    expect(
      canViewOwnedWork({
        role: "OWNER",
        userId: "manager",
        ownerUserId: "rep",
      }),
    ).toBe(true);
    expect(
      canViewOwnedWork({
        role: "ADMIN",
        userId: "manager",
        ownerUserId: "rep",
      }),
    ).toBe(true);
    expect(
      canModifyOwnedWork({ userId: "manager", ownerUserId: "rep" }),
    ).toBe(false);
    expect(canModifyOwnedWork({ userId: "rep", ownerUserId: "rep" })).toBe(
      true,
    );
  });

  it("defines owner-scoped identity and a blocking preflight", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const migration = readFileSync(
      "prisma/migrations/20260918210000_personal_lists_contacts/migration.sql",
      "utf8",
    );
    const preflight = readFileSync(
      "scripts/report-personal-work-ownership.mjs",
      "utf8",
    );

    expect(schema).toContain(
      "@@unique([organizationId, ownerUserId, normalizedEmail])",
    );
    expect(schema).toMatch(
      /owner\s+User\s+@relation\("ContactOwner"/,
    );
    expect(preflight).toContain("blockers:");
    expect(preflight).toContain("contactsThatWillBeCloned");
    expect(preflight).toContain("process.exitCode = 2");
    expect(migration).toContain('INSERT INTO "ContactResearch"');
    expect(migration).not.toContain('INSERT INTO "CompanyResearch"');
  });

  it("scopes dashboard and digest cadence counts to the user", () => {
    const dashboard = readFileSync(
      "src/lib/cadence/dashboard.ts",
      "utf8",
    );
    const digest = readFileSync("src/lib/cadence/digest.ts", "utf8");

    expect(dashboard).toContain("ownerUserId: input.userId");
    expect(digest).toContain("userId: user.id");
  });
});

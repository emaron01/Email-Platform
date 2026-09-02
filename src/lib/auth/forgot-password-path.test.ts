import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("forgot-password client path", () => {
  it("posts to Better Auth request-password-reset, not legacy forget-password", () => {
    const source = readFileSync(
      "src/app/(auth)/forgot-password/page.tsx",
      "utf8",
    );
    expect(source).toContain("/api/auth/request-password-reset");
    expect(source).not.toContain("/api/auth/forget-password");
  });

  it("surfaces HTTP failures instead of always claiming success", () => {
    const source = readFileSync(
      "src/app/(auth)/forgot-password/page.tsx",
      "utf8",
    );
    expect(source).toContain("!res.ok");
    expect(source).toContain('role="alert"');
  });
});

describe("password reset email callback", () => {
  it("wires sendResetPassword to sendTransactionalEmail with PASSWORD_RESET", () => {
    const source = readFileSync("src/lib/auth/better-auth.ts", "utf8");
    expect(source).toContain("sendResetPassword:");
    expect(source).toContain('templateKey: "PASSWORD_RESET"');
    expect(source).toContain("sendTransactionalEmail");
    expect(source).toContain(
      "[auth] password-reset sendResetPassword invoked",
    );
  });
});

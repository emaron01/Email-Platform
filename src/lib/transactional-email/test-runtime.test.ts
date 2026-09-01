import { afterEach, describe, expect, it } from "vitest";
import {
  assertLiveTransactionalEmailBlockedInTests,
  isTransactionalEmailTestRuntime,
} from "@/lib/transactional-email/test-runtime";

describe("transactional email test runtime", () => {
  afterEach(() => {
    delete process.env.TRANSACTIONAL_EMAIL_ALLOW_LIVE_SMTP_IN_TESTS;
  });

  it("detects Vitest via VITEST_WORKER_ID", () => {
    expect(isTransactionalEmailTestRuntime()).toBe(true);
  });

  it("blocks SMTP construction without per-file mocks", () => {
    expect(() =>
      assertLiveTransactionalEmailBlockedInTests({
        phase: "construct",
        provider: "smtp",
      }),
    ).toThrow(/blocked while running tests/i);
  });

  it("does not honor TRANSACTIONAL_EMAIL_ALLOW_LIVE_SMTP_IN_TESTS", () => {
    process.env.TRANSACTIONAL_EMAIL_ALLOW_LIVE_SMTP_IN_TESTS = "1";
    expect(() =>
      assertLiveTransactionalEmailBlockedInTests({
        phase: "send",
        provider: "smtp",
        recipient: "user@example.com",
      }),
    ).toThrow(/blocked while running tests/i);
  });
});

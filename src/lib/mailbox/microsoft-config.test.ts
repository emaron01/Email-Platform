import { afterEach, describe, expect, it } from "vitest";
import {
  MICROSOFT_AUTHORITY_TENANT_DEFAULT,
  microsoftAuthorityUrls,
  resolveMicrosoftAuthorityTenant,
} from "@/lib/mailbox/microsoft-config";

describe("resolveMicrosoftAuthorityTenant", () => {
  const previous = process.env.MICROSOFT_AUTHORITY_TENANT;

  afterEach(() => {
    if (previous == null) delete process.env.MICROSOFT_AUTHORITY_TENANT;
    else process.env.MICROSOFT_AUTHORITY_TENANT = previous;
  });

  it("defaults to common so personal Microsoft accounts are allowed", () => {
    delete process.env.MICROSOFT_AUTHORITY_TENANT;
    expect(resolveMicrosoftAuthorityTenant(undefined)).toBe(
      MICROSOFT_AUTHORITY_TENANT_DEFAULT,
    );
    expect(resolveMicrosoftAuthorityTenant("")).toBe("common");
  });

  it("accepts organizations, consumers, and tenant GUIDs", () => {
    expect(resolveMicrosoftAuthorityTenant("organizations")).toBe(
      "organizations",
    );
    expect(resolveMicrosoftAuthorityTenant("consumers")).toBe("consumers");
    expect(
      resolveMicrosoftAuthorityTenant("9188040d-6c67-4c5b-b112-36a304b66dad"),
    ).toBe("9188040d-6c67-4c5b-b112-36a304b66dad");
  });

  it("rejects unsafe authority segments", () => {
    expect(() => resolveMicrosoftAuthorityTenant("../evil")).toThrow(
      /MICROSOFT_AUTHORITY_TENANT/,
    );
    expect(() => resolveMicrosoftAuthorityTenant("common/oauth2")).toThrow(
      /MICROSOFT_AUTHORITY_TENANT/,
    );
  });

  it("builds matching authorize and token URLs", () => {
    expect(microsoftAuthorityUrls("common")).toEqual({
      authorizeUrl:
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    });
    expect(microsoftAuthorityUrls("organizations").authorizeUrl).toContain(
      "/organizations/",
    );
  });
});

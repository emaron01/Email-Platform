/**
 * ICP save parsing + action/UI seam tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseIcpFormData,
  readIcpFormValues,
  toSafeIcpActionError,
} from "@/lib/icp/save";
import { TenantError } from "@/lib/tenant/errors";

function formFrom(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

describe("parseIcpFormData", () => {
  it("accepts a valid create payload", () => {
    const parsed = parseIcpFormData(
      formFrom({
        id: "",
        productId: "prod_1",
        name: "Enterprise SaaS",
        definition:
          "B2B SaaS companies with 200+ employees running forecast calls.",
        targetIndustries: "SaaS, Software",
      }),
    );
    expect(parsed.fieldErrors).toEqual({});
    expect(parsed.fields.name).toBe("Enterprise SaaS");
    expect(parsed.fields.definition).toContain("forecast calls");
    expect(parsed.fields.targetIndustries).toEqual(["SaaS", "Software"]);
  });

  it("names the ICP name field when missing", () => {
    const parsed = parseIcpFormData(
      formFrom({
        productId: "prod_1",
        name: "  ",
        definition: "Long natural-language definition that must be preserved.",
      }),
    );
    expect(parsed.fieldErrors.name).toBe("ICP name is required.");
    expect(parsed.values.definition).toContain("must be preserved");
  });

  it("names numeric fields when invalid", () => {
    const parsed = parseIcpFormData(
      formFrom({
        productId: "prod_1",
        name: "Mid-market",
        minEmployees: "many",
      }),
    );
    expect(parsed.fieldErrors.minEmployees).toMatch(/whole number/i);
  });
});

describe("toSafeIcpActionError", () => {
  it("surfaces TenantError messages", () => {
    expect(toSafeIcpActionError(new TenantError("Product is required."))).toBe(
      "Product is required.",
    );
  });
});

describe("readIcpFormValues", () => {
  it("echoes the natural-language definition for restore-on-failure", () => {
    const values = readIcpFormValues(
      formFrom({
        productId: "prod_1",
        name: "X",
        definition: "Preserve this long ICP definition text.",
      }),
    );
    expect(values.definition).toBe("Preserve this long ICP definition text.");
  });
});

describe("ICP save UI seam", () => {
  it("wires useActionState result into visible status on success and failure", () => {
    const formSrc = readFileSync("src/components/IcpDetailsForm.tsx", "utf8");
    const actionsSrc = readFileSync("src/app/actions.ts", "utf8");

    // Action returns a result object (not void) so the UI can render it.
    expect(actionsSrc).toMatch(
      /export async function upsertIcpAction\([\s\S]*Promise<IcpActionResult>/,
    );
    expect(actionsSrc).toContain("ok: true");
    expect(actionsSrc).toContain("ok: false");
    expect(actionsSrc).toContain("values: parsed.values");
    expect(actionsSrc).toContain("fieldErrors");

    // Form consumes action state and surfaces it.
    expect(formSrc).toContain("useActionState");
    expect(formSrc).toContain("upsertIcpAction");
    expect(formSrc).toContain("icp-action-status");
    expect(formSrc).toContain("result.message");
    expect(formSrc).toContain("state.values");
    expect(formSrc).toContain("fieldErrors");

    // Success navigates to the ICP edit view for creates.
    expect(formSrc).toContain("router.push(`/setup/${productId}/icps/${state.icpId}`)");
  });
});

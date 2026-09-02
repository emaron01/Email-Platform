import { describe, expect, it } from "vitest";
import {
  PRODUCT_CONTINUE_PATH_PRODUCT_ID,
  buildProductContinuePath,
} from "@/components/ProductContinuePicker";

describe("buildProductContinuePath", () => {
  it("substitutes product id into the template path", () => {
    expect(
      buildProductContinuePath(
        `/setup/${PRODUCT_CONTINUE_PATH_PRODUCT_ID}/icps/new`,
        "prod_abc",
      ),
    ).toBe("/setup/prod_abc/icps/new");
  });

  it("supports hash fragments", () => {
    expect(
      buildProductContinuePath(
        `/setup/${PRODUCT_CONTINUE_PATH_PRODUCT_ID}#personas`,
        "prod_xyz",
      ),
    ).toBe("/setup/prod_xyz#personas");
  });
});

import { describe, expect, it } from "vitest";
import { excerptsFromBundleJson } from "@/lib/product-research/acquire";

describe("excerptsFromBundleJson", () => {
  it("reads excerpts from normalized bundle json", () => {
    const excerpts = excerptsFromBundleJson({
      excerpts: [
        {
          sourceId: "s1",
          sourceType: "PASTED_TEXT",
          displayName: "Paste",
          text: "hello",
        },
      ],
    });
    expect(excerpts).toHaveLength(1);
    expect(excerpts[0]?.sourceId).toBe("s1");
  });

  it("supports legacy array bundles", () => {
    const excerpts = excerptsFromBundleJson([
      {
        sourceId: "s2",
        sourceType: "USER_NOTE",
        displayName: "Note",
        text: "note",
      },
    ]);
    expect(excerpts[0]?.sourceId).toBe("s2");
  });
});

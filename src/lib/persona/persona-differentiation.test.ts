import { describe, expect, it } from "vitest";
import {
  findNearDuplicatePersonaPairs,
  parsePersonaListField,
} from "@/lib/persona/persona-differentiation";

describe("persona differentiation", () => {
  it("parses newline-separated persona list fields", () => {
    expect(parsePersonaListField("One\nTwo\n")).toEqual(["One", "Two"]);
  });

  it("flags near-duplicate personas by pain and messaging overlap", () => {
    const pairs = findNearDuplicatePersonaPairs([
      {
        id: "a",
        name: "Persona A",
        painPoints: [
          "Forecast commits rely on seller optimism instead of deal evidence",
        ],
        messagingNotes: ["Lead with forecast trust and commit risk"],
      },
      {
        id: "b",
        name: "Persona B",
        painPoints: [
          "Forecast commits rely on seller optimism instead of deal evidence",
        ],
        messagingNotes: ["Lead with forecast trust and commit risk"],
      },
      {
        id: "c",
        name: "Persona C",
        painPoints: ["Payroll exceptions spike during multi-state compliance audits"],
        messagingNotes: ["Lead with compliance exposure"],
      },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.personaA.name).toBe("Persona A");
    expect(pairs[0]?.personaB.name).toBe("Persona B");
  });

  it("does not flag genuinely distinct personas", () => {
    const pairs = findNearDuplicatePersonaPairs([
      {
        id: "a",
        name: "Persona A",
        painPoints: ["Forecast commits lack deal evidence"],
        messagingNotes: [],
      },
      {
        id: "c",
        name: "Persona C",
        painPoints: ["Payroll exceptions spike during compliance audits"],
        messagingNotes: [],
      },
    ]);
    expect(pairs).toEqual([]);
  });
});

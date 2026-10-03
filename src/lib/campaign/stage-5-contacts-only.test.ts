import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCampaignStages, resolveCampaignStage } from "@/lib/workflow/campaign-stages";

const manager = readFileSync(
  "src/components/CampaignContactsManager.tsx",
  "utf8",
);
const buckets = readFileSync("src/components/QualificationBuckets.tsx", "utf8");
const page = readFileSync("src/app/(app)/campaigns/[id]/page.tsx", "utf8");
const emailAction = readFileSync("src/app/actions/email.ts", "utf8");
const contacts = readFileSync("src/lib/campaign/contacts.ts", "utf8");

describe("stage 5 contacts only", () => {
  it("shows no companies section", () => {
    const exceptions = manager.slice(
      manager.indexOf('data-testid="list-preparation-exceptions"'),
    );
    expect(exceptions).not.toContain("Companies that did not match");
    expect(exceptions).toContain("Contacts that did not match");
    expect(exceptions.match(/<QualificationBuckets/g)).toHaveLength(1);
  });

  it("shows the contact title and the stored score reason", () => {
    expect(buckets).toContain("row.title");
    expect(buckets).toContain("row.scoreReason");
    expect(buckets).toContain("showScoreReason");
    expect(contacts).toContain("scoreReason: readQualificationReason");
    expect(manager).toContain("showScoreReason");
    const exceptions = manager.slice(
      manager.indexOf('data-testid="list-preparation-exceptions"'),
    );
    expect(exceptions).not.toContain("Qualification is incomplete");
  });

  it("marks stages 6 and 7 complete after approve and lands on Emails", () => {
    const stages = buildCampaignStages({
      setupComplete: true,
      hasListData: true,
      companyResultCount: 0,
      survivingCompanyCount: 0,
      qualifiedContactCount: 1,
      generatedEmailCount: 0,
      sentEmailCount: 0,
      dueContactCount: 0,
    });
    expect(stages.find((stage) => stage.key === "companies")).toMatchObject({
      completed: true,
      available: true,
    });
    expect(stages.find((stage) => stage.key === "contacts")).toMatchObject({
      completed: true,
      available: true,
    });
    expect(resolveCampaignStage(undefined, stages)).toBe("emails");
    expect(resolveCampaignStage("companies", stages)).toBe("companies");
    expect(resolveCampaignStage("contacts", stages)).toBe("contacts");
    const href = readFileSync("src/lib/lists/campaign-query.ts", "utf8");
    expect(href).toContain('params.set("stage", "emails")');
  });

  it("opens the company research profile from the company row", () => {
    expect(buckets).toContain("Open company research");
    expect(buckets).toContain("href={`/companies/${row.id}`}");
    expect(page).toContain('currentStage === "companies"');
  });

  it("sets the email persona without rescoring", () => {
    const action = emailAction.slice(
      emailAction.indexOf("export async function setCampaignContactPersonaAction"),
      emailAction.indexOf("function generationOptionsFromPrepared"),
    );
    expect(action).toContain("persistChosenPersonaForGeneration");
    expect(emailAction).toContain("data: { chosenPersonaId: personaId }");
    expect(action).not.toContain("runScoringForRun");
    expect(action).not.toContain("scoreSingleContact");
    expect(action).not.toContain("generateEmailDraft");
    expect(page).toContain("personaSelection");
    expect(buckets).toContain("Persona for email");
    expect(buckets).toContain("setCampaignContactPersonaAction");
  });
});

/**
 * Rebuild one persona per product with PERSONA_SYNTHESIS_PROMPT_VERSION 8.
 * npx dotenv -e .env.local -e .env -- tsx scripts/validate-persona-synthesis-v8.ts
 */
import Module from "node:module";
import { CRO_PERSONA_DRAFT_V2_FIXTURE } from "../src/lib/persona-research/fixtures/cro-setup-run-draft-v2";
import { buildPersonaSynthesisMessages } from "../src/lib/persona-research/prompt";
import { PERSONA_SYNTHESIS_PROMPT_VERSION } from "../src/lib/persona-research/contract";
import { parsePersonaAiResponse } from "../src/lib/persona-research/contract";
import { structuredOutputRequest } from "../src/lib/ai/structured-output-schemas";

type ModuleLoad = (
  request: string,
  parent: NodeModule | null,
  isMain: boolean,
) => unknown;
const patchedModule = Module as typeof Module & { _load: ModuleLoad };
const moduleLoad = patchedModule._load.bind(patchedModule);
patchedModule._load = function load(
  request: string,
  parent: NodeModule | null,
  isMain: boolean,
): unknown {
  if (request === "server-only") return {};
  return moduleLoad(request, parent, isMain);
};

const PHARMACY_OPS_EXISTING = {
  id: "persona_pharmacy_ops",
  name: "Director of Pharmacy Operations",
  painPoints: [
    "Dispensing workflows vary by facility and are hard to standardize",
    "Clinical exceptions at one site do not surface to central operations quickly",
    "Billing and fulfillment handoffs break when sites use different processes",
  ],
  messagingNotes: [
    "Lead with workflow inconsistency across facilities, not network monitoring",
  ],
};

const salesForecasterEvidence = [
  {
    sourceId: "sf_1",
    displayName: "Product overview",
    text: `SalesForecaster helps B2B revenue teams run evidence-backed forecast calls.
Executives need to know which commits are real before they reach the board.
Front-line sales managers run weekly forecast meetings and coach reps on live deals.
The platform surfaces unsupported commits, qualification gaps, and coaching opportunities without adding RevOps headcount.`,
  },
];

const nomEvidence = [
  {
    sourceId: "nom_1",
    displayName: "Product overview",
    text: `OpenText Network Operations Management provides end-to-end visibility across distributed operational sites.
Infrastructure leaders need centralized telemetry, policy compliance, and incident visibility without dispatching engineers to every location.
Pharmacy and clinical operations leaders run facility-level dispensing workflows, billing handoffs, and site exception management.
The platform helps operations teams see network posture and site health from a central operations view.`,
  },
];

const TARGETS = [
  {
    label: "SalesForecaster · VP of Sales (sibling: CRO)",
    productName: "SalesForecaster",
    productSnapshot: {
      name: "SalesForecaster",
      description: "Forecast and pipeline intelligence for revenue teams",
      valueProposition: "Evidence-backed commits and earlier risk visibility",
    },
    productMessaging: {
      supportedClaims: ["Improves forecast inspection workflows"],
      claimsNotToMake: ["Guaranteed forecast accuracy"],
    },
    productEvidence: salesForecasterEvidence,
    buyerRole: {
      name: "VP of Sales",
      likelyTitles: [
        "VP Sales",
        "Vice President of Sales",
        "Senior Vice President of Sales",
      ],
      departmentFunction: "Sales leadership",
      whyThisRoleMatters:
        "Owns field sales execution, manager coaching, and front-line forecast discipline",
      suggestionKey: "vp_sales",
      confidence: "HIGH" as const,
      evidenceRefs: [],
    },
    existingApprovedPersonas: [
      {
        id: "persona_cro",
        name: CRO_PERSONA_DRAFT_V2_FIXTURE.name,
        painPoints: CRO_PERSONA_DRAFT_V2_FIXTURE.painPoints,
        messagingNotes: CRO_PERSONA_DRAFT_V2_FIXTURE.messagingNotes ?? [],
      },
    ],
  },
  {
    label: "OpenText NOM · VP Infrastructure (sibling: Director Pharmacy Ops)",
    productName: "OpenText NOM",
    productSnapshot: {
      name: "OpenText NOM",
      description: "Network operations and observability platform",
      valueProposition: "End-to-end visibility across distributed sites",
    },
    productMessaging: {
      supportedClaims: ["Centralizes operational telemetry across sites"],
      claimsNotToMake: ["Guaranteed uptime"],
    },
    productEvidence: nomEvidence,
    buyerRole: {
      name: "VP Infrastructure",
      likelyTitles: ["VP Infrastructure", "VP IT Infrastructure", "Head of Infrastructure"],
      departmentFunction: "Infrastructure and network operations",
      whyThisRoleMatters:
        "Owns network posture, site connectivity, and operational telemetry across distributed facilities",
      suggestionKey: "vp_infrastructure",
      confidence: "HIGH" as const,
      evidenceRefs: [],
    },
    existingApprovedPersonas: [PHARMACY_OPS_EXISTING],
  },
];

function mirrorPersonaAiEnv() {
  if (process.env.PERSONA_AI_API_KEY?.trim()) return;
  const source =
    process.env.RESEARCH_AI_API_KEY?.trim() ?
      "RESEARCH_AI"
    : process.env.SCORING_AI_API_KEY?.trim() ?
      "SCORING_AI"
    : process.env.EMAIL_AI_API_KEY?.trim() ?
      "EMAIL_AI"
    : null;
  if (!source) return;
  for (const suffix of [
    "PROVIDER",
    "MODEL",
    "MODEL_URL",
    "API_KEY",
    "TIMEOUT_MS",
    "MAX_RETRIES",
    "TEMPERATURE",
    "REASONING_EFFORT",
  ]) {
    const from = `${source}_${suffix}`;
    const to = `PERSONA_AI_${suffix}`;
    if (!process.env[to]?.trim() && process.env[from]?.trim()) {
      process.env[to] = process.env[from];
    }
  }
}

function summarizeDraft(draft: {
  name: string;
  roleSummary?: string | null;
  primaryResponsibilities?: string[];
  ownershipAreas?: string[];
  kpisAndAccountabilities?: string[];
  painPoints?: string[];
  messagingNotes?: string[];
  negativeRoleSignals?: Array<string | { text?: string; signal?: string }>;
}) {
  return {
    name: draft.name,
    roleSummary: draft.roleSummary ?? null,
    primaryResponsibilities: draft.primaryResponsibilities ?? [],
    ownershipAreas: draft.ownershipAreas ?? [],
    kpisAndAccountabilities: draft.kpisAndAccountabilities ?? [],
    painPoints: draft.painPoints ?? [],
    messagingNotes: draft.messagingNotes ?? [],
    negativeRoleSignals: (draft.negativeRoleSignals ?? []).map((entry) =>
      typeof entry === "string" ? entry : (entry.text ?? entry.signal ?? ""),
    ),
  };
}

async function main() {
  mirrorPersonaAiEnv();
  const { getPersonaAiProvider, isPersonaAiConfigured } = await import(
    "../src/lib/ai"
  );

  console.log(`PERSONA_SYNTHESIS_PROMPT_VERSION = ${PERSONA_SYNTHESIS_PROMPT_VERSION}`);
  const sample = buildPersonaSynthesisMessages({
    productName: "Example",
    productSnapshot: { name: "Example" },
    productMessaging: null,
    buyerRole: {
      name: "Role B",
      likelyTitles: ["Director"],
      departmentFunction: "Operations",
      whyThisRoleMatters: "Owns process",
      suggestionKey: "role_b",
      confidence: "HIGH",
      evidenceRefs: [],
    },
    userContext: null,
    productEvidence: [],
    personaEvidence: [],
    icpContext: null,
    existingApprovedPersonas: [
      {
        id: "p1",
        name: "Role A",
        painPoints: ["Shared pain"],
        messagingNotes: ["Shared note"],
      },
    ],
  });
  const rule14 = sample[0]!
    .content.split("\n")
    .find((line) => line.startsWith("14."));
  console.log("\nRule 14 wording:\n", rule14);

  if (!isPersonaAiConfigured()) {
    console.error(
      "\nPersona AI is not configured. Set PERSONA_AI_* (or shared AI env) to run live rebuilds.",
    );
    process.exit(1);
  }

  const ai = getPersonaAiProvider();
  const results: Array<{ label: string; draft: ReturnType<typeof summarizeDraft> }> =
    [];

  for (const target of TARGETS) {
    console.log(`\n=== Rebuilding: ${target.label} ===`);
    const messages = buildPersonaSynthesisMessages({
      productName: target.productName,
      productSnapshot: target.productSnapshot,
      productMessaging: target.productMessaging,
      buyerRole: target.buyerRole,
      userContext: null,
      productEvidence: target.productEvidence,
      personaEvidence: [],
      icpContext: null,
      existingApprovedPersonas: target.existingApprovedPersonas,
    });
    const response = await ai.generateStructured({
      ...structuredOutputRequest("personaSynthesis"),
      messages,
      parseOutput: parsePersonaAiResponse,
    });
    const summary = summarizeDraft(response.data.personaDraft);
    results.push({ label: target.label, draft: summary });
    console.log(JSON.stringify(summary, null, 2));
  }

  console.log("\n=== NOM pair degradation check ===");
  const nom = results.find((row) => row.label.includes("OpenText NOM"));
  if (nom) {
    const pharmacyTerms = ["dispensing", "billing", "clinical", "pharmacy", "fulfillment"];
    const infraText = [
      nom.draft.roleSummary ?? "",
      ...nom.draft.painPoints,
      ...nom.draft.ownershipAreas,
      ...nom.draft.primaryResponsibilities,
    ]
      .join(" ")
      .toLowerCase();
    const pharmacyLeakage = pharmacyTerms.filter((term) =>
      infraText.includes(term),
    );
    console.log(
      pharmacyLeakage.length === 0
        ? "PASS — rebuilt VP Infrastructure does not read like Pharmacy Ops"
        : `WARN — pharmacy-domain terms in VP Infrastructure draft: ${pharmacyLeakage.join(", ")}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

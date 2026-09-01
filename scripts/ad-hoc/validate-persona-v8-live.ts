/**
 * Live v8 validation — review-only drafts, no DB writes.
 * npx dotenv -e .env.local -e .env -- tsx scripts/ad-hoc/validate-persona-v8-live.ts
 */
import Module from "node:module";
import { CRO_PERSONA_DRAFT_V2_FIXTURE } from "../../src/lib/persona-research/fixtures/cro-setup-run-draft-v2";
import { buildPersonaSynthesisMessages } from "../../src/lib/persona-research/prompt";
import {
  PERSONA_SYNTHESIS_PROMPT_VERSION,
  parsePersonaAiResponse,
  type PersonaAiDraft,
} from "../../src/lib/persona-research/contract";
import { structuredOutputRequest } from "../../src/lib/ai/structured-output-schemas";
import type { EmailGenerationContext } from "../../src/lib/email-generation/context";
import type { EmailCompanyResearch } from "../../src/lib/email-generation/company-research-use";

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

const RULE_14 =
  "When existingApprovedPersonas is non-empty, articulate what distinguishes this role's daily experience and accountability from those personas: scope, reporting line, what they are measured on, and what lands on their desk. Do not try to \"make them different.\" painPoints and messagingNotes may overlap when the overlap is genuine — honest overlap is better than manufactured contrast. Use the supplied painPoints and messagingNotes from existing personas only as context; derive this role's distinctions from the selected buyer role, responsibilities, and product evidence.";

const DOMAIN_TERMS = [
  "sales",
  "forecast",
  "revenue",
  "infrastructure",
  "clinical",
  "pharmacy",
  "procurement",
  "facilities",
  "network",
  "pipeline",
  "crm",
  "deal",
  "buyer",
  "seller",
  "quota",
  "board",
  "executive",
  "manager",
  "rep",
  "ops",
  "operations",
];

const stoneEagleResearch: EmailCompanyResearch = {
  companySummary:
    "StoneEagle provides F&I and dealership software to automotive retail groups.",
  whatTheySell: "B2B automotive-dealership software and data intelligence.",
  customerTypes: ["auto dealer groups", "franchise dealerships"],
  primaryMarkets: ["US automotive retail"],
  businessModel:
    "B2B software licensed to multi-rooftop dealer groups that sell through retail networks",
  companySizeContext: "201–500 employees in Dallas.",
  confidence: "HIGH",
};

const salesForecasterProduct = {
  id: "product_sf",
  name: "SalesForecaster",
  description: "Forecast and pipeline intelligence for revenue teams",
  valueProposition: "Evidence-backed commits and earlier risk visibility",
  evidence: [],
  problemsSolved: [
    "Forecast commits rest on seller optimism instead of deal evidence",
    "Pipeline risk stays hidden until late in the quarter",
  ],
  messaging: {
    primaryPositioning: [],
    coreValueThemes: [],
    strongestDifferentiators: [],
    proofPoints: [],
    supportedClaims: ["Improves forecast inspection workflows"],
    claimsNotToMake: ["Guaranteed forecast accuracy"],
    terminologyToUse: [],
    terminologyToAvoid: [],
  },
};

const nomProduct = {
  id: "product_nom",
  name: "OpenText NOM",
  description: "Network operations and observability platform",
  valueProposition: "End-to-end visibility across distributed sites",
  evidence: [],
  problemsSolved: [
    "Limited visibility into remote operational sites",
    "Network policy drift and compliance gaps between locations",
  ],
  messaging: {
    primaryPositioning: [],
    coreValueThemes: [],
    strongestDifferentiators: [],
    proofPoints: [],
    supportedClaims: ["Centralizes operational telemetry across sites"],
    claimsNotToMake: ["Guaranteed uptime"],
    terminologyToUse: [],
    terminologyToAvoid: [],
  },
};

const VP_SALES_PEER = {
  id: "persona_vp_sales",
  name: "VP of Sales",
  painPoints: [
    "Managers spend forecast calls collecting updates instead of coaching reps on live deals",
    "Rep-level pipeline hygiene is inconsistent across regions",
    "Field leaders lack a shared view of which opportunities are truly commit-worthy",
  ],
  messagingNotes: [
    "Lead with manager time lost to status collection, not executive reporting",
  ],
};

const VP_INFRA_BASELINE = {
  painPoints: [
    "Limited visibility into what is happening at remote facilities",
    "Inconsistent network posture between sites",
  ],
  desiredOutcomesFromSolution: [
    "Centralized operational visibility without dispatching engineers everywhere",
    "Uniform compliance enforcement across locations",
  ],
  messagingNotes: [] as string[],
};

const PHARMACY_OPS_PEER = {
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
    sourceType: "USER_NOTE",
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
    sourceType: "USER_NOTE",
    displayName: "Product overview",
    text: `OpenText Network Operations Management provides end-to-end visibility across distributed operational sites.
Infrastructure leaders need centralized telemetry, policy compliance, and incident visibility without dispatching engineers to every location.
Pharmacy and clinical operations leaders run facility-level dispensing workflows, billing handoffs, and site exception management.
The platform helps operations teams see network posture and site health from a central operations view.`,
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

function mirrorEmailAiEnv() {
  const source =
    process.env.EMAIL_AI_API_KEY?.trim() ?
      "email"
    : process.env.RESEARCH_AI_API_KEY?.trim() ?
      "research"
    : process.env.SCORING_AI_API_KEY?.trim() ?
      "scoring"
    : null;
  if (!process.env.EMAIL_AI_PROVIDER && source) {
    const prefix =
      source === "email" ? "EMAIL_AI"
      : source === "research" ? "RESEARCH_AI"
      : "SCORING_AI";
    process.env.EMAIL_AI_PROVIDER = process.env[`${prefix}_PROVIDER`];
    process.env.EMAIL_AI_API_KEY = process.env[`${prefix}_API_KEY`];
    process.env.EMAIL_AI_MODEL_URL = process.env[`${prefix}_MODEL_URL`];
    process.env.EMAIL_AI_MODEL = process.env[`${prefix}_MODEL`];
  }
}

function personaFromDraft(id: string, draft: PersonaAiDraft) {
  return {
    id,
    name: draft.name,
    painPoints: draft.painPoints,
    desiredOutcomes: draft.desiredOutcomesFromSolution,
    messagingNotes: draft.messagingNotes ?? [],
    messaging: {
      positioning: draft.personaSpecificPositioning,
      proofPoints: draft.proofPointsToEmphasize,
      objections: draft.likelyObjections,
    },
    profile: {
      terminology: draft.terminology,
      organizationalPressures: draft.organizationalPressures ?? [],
      buyingRole: draft.buyingRole ? [draft.buyingRole] : [],
      decisionInfluence: draft.decisionInfluence ? [draft.decisionInfluence] : [],
    },
  };
}

function vpSalesPersonaForEmail() {
  return {
    id: VP_SALES_PEER.id,
    name: VP_SALES_PEER.name,
    painPoints: VP_SALES_PEER.painPoints,
    desiredOutcomes: [
      "More coaching time in forecast meetings",
      "Consistent qualification standards across the sales organization",
    ],
    messagingNotes: VP_SALES_PEER.messagingNotes,
    messaging: {
      positioning: ["Help front-line sales leaders coach with evidence"],
      proofPoints: ["Deal-level inspection without adding rep admin"],
      objections: ["Another dashboard reps will ignore"],
    },
    profile: {
      terminology: ["pipeline", "commit", "field leaders"],
      organizationalPressures: [],
      buyingRole: [],
      decisionInfluence: [],
    },
  };
}

function baseEmailContext(
  overrides: Partial<EmailGenerationContext>,
): EmailGenerationContext {
  return {
    organizationId: "org_validation",
    userId: "user_validation",
    campaignContact: {
      id: "cc_validation",
      campaignId: "campaign_validation",
      contactId: "contact_validation",
    },
    campaign: {
      id: "campaign_validation",
      name: "Validation",
      offerName: "Working session",
      offerDescription: "A 20-minute review",
      offerCta: "Reply with a time that works",
      offerNotes: null,
      offerValidationJson: null,
      offerValidationHash: null,
      emailLength: "MEDIUM",
      emailGuidance: null,
    },
    emailLength: "MEDIUM",
    contact: {
      id: "contact_validation",
      companyId: "company_validation",
      firstName: "Brent",
      lastName: "Lee",
      email: "brent@stone.test",
      title: "Chief Revenue Officer",
      company: "StoneEagle",
      industry: null,
      location: null,
    },
    product: salesForecasterProduct,
    persona: personaFromDraft("persona_cro", CRO_PERSONA_DRAFT_V2_FIXTURE),
    icp: {
      id: "icp_validation",
      name: "Target accounts",
      definition: "Organizations matching the approved ICP",
      description: null,
    },
    personaResolution: {
      source: "matched",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: null,
      decisionReason: null,
    },
    excludedCopySignals: {
      riskSignals: [],
      professionalSignals: [],
      negativeRoleSignals: [],
    },
    companyResearchUpdatedAt: null,
    voiceSamples: [],
    sequence: [],
    companyResearch: stoneEagleResearch,
    contactResearch: null,
    ...overrides,
  };
}

async function synthesizePersona(input: {
  label: string;
  productName: string;
  productSnapshot: Record<string, unknown>;
  productMessaging: Record<string, unknown>;
  productEvidence: Array<{
    sourceId: string;
    sourceType: string;
    displayName: string;
    text: string;
  }>;
  buyerRole: {
    name: string;
    likelyTitles: string[];
    departmentFunction: string;
    whyThisRoleMatters: string;
    suggestionKey: string;
    confidence: "HIGH";
    evidenceRefs: [];
  };
  existingApprovedPersonas: Array<{
    id: string;
    name: string;
    painPoints: string[];
    messagingNotes: string[];
  }>;
}): Promise<PersonaAiDraft> {
  const { getPersonaAiProvider } = await import("../../src/lib/ai");
  const ai = getPersonaAiProvider();
  const messages = buildPersonaSynthesisMessages({
    productName: input.productName,
    productSnapshot: input.productSnapshot,
    productMessaging: input.productMessaging,
    buyerRole: input.buyerRole,
    userContext: null,
    productEvidence: input.productEvidence,
    personaEvidence: [],
    icpContext: null,
    existingApprovedPersonas: input.existingApprovedPersonas,
  });
  console.log(`\n${"=".repeat(72)}\n${input.label}\n${"=".repeat(72)}`);
  const response = await ai.generateStructured({
    ...structuredOutputRequest("personaSynthesis"),
    messages,
    parseOutput: parsePersonaAiResponse,
  });
  return response.data.personaDraft;
}

function printFieldComparison(
  label: string,
  current: string[],
  rebuilt: string[],
) {
  console.log(`\n--- ${label} ---`);
  console.log("CURRENT:");
  for (const line of current) console.log(`  • ${line}`);
  console.log("REBUILT:");
  for (const line of rebuilt) console.log(`  • ${line}`);
}

function auditRule14Generality() {
  console.log("GENERALITY AUDIT — Rule 14 only");
  console.log(`PERSONA_SYNTHESIS_PROMPT_VERSION = ${PERSONA_SYNTHESIS_PROMPT_VERSION}`);
  console.log(`\nExact wording:\n${RULE_14}\n`);
  const lower = RULE_14.toLowerCase();
  const hits = DOMAIN_TERMS.filter((term) => lower.includes(term));
  const schemaTerms = ["existingapprovedpersonas", "painpoints", "messagingnotes", "buyer role", "product evidence"];
  const flagged = hits.filter(
    (term) => !schemaTerms.some((schema) => lower.includes(schema) && term.length < 4),
  );
  if (flagged.length === 0) {
    console.log("PASS — no domain-specific vocabulary in Rule 14.");
  } else {
    console.log(`FLAG — possible domain terms: ${flagged.join(", ")}`);
  }
  console.log(
    "\nNote: Rule 13 examples elsewhere in the prompt still contain illustrative domain examples (pre-existing, not part of Rule 14).",
  );
}

async function main() {
  auditRule14Generality();
  mirrorPersonaAiEnv();
  mirrorEmailAiEnv();

  const { isPersonaAiConfigured } = await import("../../src/lib/ai");
  if (!isPersonaAiConfigured()) {
    throw new Error("Persona AI is not configured.");
  }
  if (!process.env.EMAIL_AI_MODEL?.trim()) {
    throw new Error("EMAIL_AI_MODEL is required for live email drafts.");
  }

  const rebuiltCro = await synthesizePersona({
    label: "(a) SalesForecaster · CRO rebuild (peer: VP of Sales)",
    productName: "SalesForecaster",
    productSnapshot: {
      name: "SalesForecaster",
      description: "Forecast and pipeline intelligence for revenue teams",
      valueProposition: "Evidence-backed commits and earlier risk visibility",
    },
    productMessaging: salesForecasterProduct.messaging,
    productEvidence: salesForecasterEvidence,
    buyerRole: {
      name: "Chief Revenue Officer",
      likelyTitles: ["CRO", "Chief Revenue Officer", "Chief Sales Officer"],
      departmentFunction: "Revenue leadership",
      whyThisRoleMatters:
        "Owns enterprise revenue performance, forecast confidence, and executive accountability for committed revenue",
      suggestionKey: "cro",
      confidence: "HIGH",
      evidenceRefs: [],
    },
    existingApprovedPersonas: [VP_SALES_PEER],
  });

  printFieldComparison(
    "painPoints",
    CRO_PERSONA_DRAFT_V2_FIXTURE.painPoints,
    rebuiltCro.painPoints,
  );
  printFieldComparison(
    "desiredOutcomesFromSolution",
    CRO_PERSONA_DRAFT_V2_FIXTURE.desiredOutcomesFromSolution,
    rebuiltCro.desiredOutcomesFromSolution,
  );
  printFieldComparison(
    "messagingNotes",
    CRO_PERSONA_DRAFT_V2_FIXTURE.messagingNotes ?? [],
    rebuiltCro.messagingNotes ?? [],
  );

  const rebuiltNomInfra = await synthesizePersona({
    label: "(b) OpenText NOM · VP Infrastructure rebuild (peer: Director Pharmacy Ops)",
    productName: "OpenText NOM",
    productSnapshot: {
      name: "OpenText NOM",
      description: "Network operations and observability platform",
      valueProposition: "End-to-end visibility across distributed sites",
    },
    productMessaging: nomProduct.messaging,
    productEvidence: nomEvidence,
    buyerRole: {
      name: "VP Infrastructure",
      likelyTitles: ["VP Infrastructure", "VP IT Infrastructure", "Head of Infrastructure"],
      departmentFunction: "Infrastructure and network operations",
      whyThisRoleMatters:
        "Owns network posture, site connectivity, and operational telemetry across distributed facilities",
      suggestionKey: "vp_infrastructure",
      confidence: "HIGH",
      evidenceRefs: [],
    },
    existingApprovedPersonas: [PHARMACY_OPS_PEER],
  });

  printFieldComparison(
    "painPoints",
    VP_INFRA_BASELINE.painPoints,
    rebuiltNomInfra.painPoints,
  );
  printFieldComparison(
    "desiredOutcomesFromSolution",
    VP_INFRA_BASELINE.desiredOutcomesFromSolution,
    rebuiltNomInfra.desiredOutcomesFromSolution,
  );
  printFieldComparison(
    "messagingNotes",
    VP_INFRA_BASELINE.messagingNotes,
    rebuiltNomInfra.messagingNotes ?? [],
  );

  const pharmacyLeakage = ["dispensing", "billing", "clinical", "pharmacy", "fulfillment"].filter(
    (term) =>
      [
        rebuiltNomInfra.roleSummary ?? "",
        ...rebuiltNomInfra.painPoints,
        ...rebuiltNomInfra.ownershipAreas,
        ...rebuiltNomInfra.primaryResponsibilities,
        ...(rebuiltNomInfra.desiredOutcomesFromSolution ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
  );
  console.log(
    `\nNOM degradation (core fields only): ${
      pharmacyLeakage.length === 0 ?
        "PASS — no pharmacy-domain bleed into VP Infrastructure core fields"
      : `WARN — pharmacy terms in core fields: ${pharmacyLeakage.join(", ")}`
    }`,
  );

  const { prepareEmailGenerationMessages } = await import(
    "../../src/lib/email-generation/prepare-email-generation"
  );
  const { getEmailAiProvider } = await import("@/lib/ai");
  const { removeEmDashes, sanitizeGeneratedEmailBody } = await import(
    "../../src/lib/email-generation/service"
  );
  const ai = getEmailAiProvider();

  const emailTargets = [
    {
      label: "(c) Email · CRO @ StoneEagle (rebuilt CRO persona)",
      context: baseEmailContext({
        contact: {
          id: "c_cro",
          companyId: "company_stone",
          firstName: "Brent",
          lastName: "Lee",
          email: "brent@stone.test",
          title: "Chief Revenue Officer",
          company: "StoneEagle",
          industry: null,
          location: null,
        },
        persona: personaFromDraft("persona_cro_rebuilt", rebuiltCro),
      }),
    },
    {
      label: "(c) Email · VP of Sales @ StoneEagle (stored VP persona)",
      context: baseEmailContext({
        contact: {
          id: "c_vp",
          companyId: "company_stone",
          firstName: "Brent",
          lastName: "Lee",
          email: "brent@stone.test",
          title: "Vice President of Sales",
          company: "StoneEagle",
          industry: null,
          location: null,
        },
        persona: vpSalesPersonaForEmail(),
      }),
    },
  ];

  for (const target of emailTargets) {
    const prepared = await prepareEmailGenerationMessages(target.context);
    const response = await ai.generateStructured({
      ...structuredOutputRequest("emailDraftGeneration"),
      messages: prepared.messages,
    });
    const subject = removeEmDashes(response.data.subject);
    const body = sanitizeGeneratedEmailBody(response.data.body);
    console.log(`\n${"=".repeat(72)}\n${target.label}\n${"=".repeat(72)}`);
    console.log(`SUBJECT: ${subject}`);
    console.log("-".repeat(72));
    console.log(body);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

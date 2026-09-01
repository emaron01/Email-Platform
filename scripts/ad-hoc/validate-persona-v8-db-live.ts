/**
 * Live v8 validation using real approved personas and product evidence from the DB.
 * Review-only — no writes.
 *
 * npx dotenv -e .env.local -e .env -- tsx scripts/ad-hoc/validate-persona-v8-db-live.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", override: true });

import Module from "node:module";
import { PrismaClient } from "@prisma/client";
import { buildPersonaSynthesisMessages } from "../../src/lib/persona-research/prompt";
import {
  PERSONA_SYNTHESIS_PROMPT_VERSION,
  parsePersonaAiResponse,
  type PersonaAiDraft,
} from "../../src/lib/persona-research/contract";
import { structuredOutputRequest } from "../../src/lib/ai/structured-output-schemas";
import { parsePersonaListField } from "../../src/lib/persona/persona-differentiation";
import { selectProductEvidenceForPersona } from "../../src/lib/persona-research/compact";
import type { EvidenceExcerpt } from "../../src/lib/product-research/prompt";
import { asTitleList } from "../../src/lib/persona/manual-target-titles";

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

const SF_PRODUCT_NAME = "Mathew Sales Forecaster";
const NOM_PRODUCT_NAME = "OT NOM";
const SF_CRO_NAME = "Chief Revenue Officer";
const SF_VP_SALES_NAME = "VP of Sales";
const NOM_TARGET_NAME = "Network Operations Leader";

function excerptsFromBundle(raw: unknown): EvidenceExcerpt[] {
  if (Array.isArray(raw)) return raw as EvidenceExcerpt[];
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { excerpts?: unknown }).excerpts)
  ) {
    return (raw as { excerpts: EvidenceExcerpt[] }).excerpts;
  }
  return [];
}

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

function printFieldComparison(
  label: string,
  current: string[],
  rebuilt: string[],
) {
  console.log(`\n--- ${label} ---`);
  console.log("CURRENT (from DB):");
  for (const line of current) console.log(`  • ${line}`);
  console.log("REBUILT (live synthesis):");
  for (const line of rebuilt) console.log(`  • ${line}`);
}

async function synthesizePersona(input: {
  label: string;
  productName: string;
  productSnapshot: Record<string, unknown>;
  productMessaging: Record<string, unknown> | null;
  productEvidence: EvidenceExcerpt[];
  buyerRole: {
    name: string;
    likelyTitles: string[];
    departmentFunction: string | null;
    whyThisRoleMatters: string | null;
    suggestionKey: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
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

function peerSnapshot(
  personas: Array<{
    id: string;
    name: string;
    painPoints: string | null;
    messagingNotes: string | null;
  }>,
) {
  return personas.map((p) => ({
    id: p.id,
    name: p.name,
    painPoints: parsePersonaListField(p.painPoints),
    messagingNotes: parsePersonaListField(p.messagingNotes),
  }));
}

function buyerRoleFromPersona(persona: {
  id: string;
  name: string;
  suggestionKey: string | null;
  department: string | null;
  targetTitles: unknown;
  whyThisPersonaMatters: string | null;
  definition: string | null;
}) {
  return {
    name: persona.name,
    likelyTitles: asTitleList(persona.targetTitles),
    departmentFunction: persona.department,
    whyThisRoleMatters:
      persona.whyThisPersonaMatters ?? persona.definition ?? null,
    suggestionKey:
      persona.suggestionKey ??
      `persona-${persona.name.toLowerCase().replace(/\s+/g, "-")}`,
    confidence: "HIGH" as const,
    evidenceRefs: [] as [],
  };
}

async function loadProductContext(
  prisma: PrismaClient,
  productName: string,
) {
  const product = await prisma.product.findFirst({
    where: { name: productName, archivedAt: null },
  });
  if (!product) {
    throw new Error(`Product not found: ${productName}`);
  }
  const bundleId =
    product.approvedEvidenceBundleId ??
    (
      await prisma.productEvidenceBundle.findFirst({
        where: { productId: product.id },
        orderBy: { version: "desc" },
      })
    )?.id;
  if (!bundleId) {
    throw new Error(`No evidence bundle for product: ${productName}`);
  }
  const bundle = await prisma.productEvidenceBundle.findFirst({
    where: { id: bundleId },
  });
  const excerpts = excerptsFromBundle(bundle?.normalizedEvidenceJson);
  return { product, excerpts };
}

async function main() {
  mirrorPersonaAiEnv();
  const { isPersonaAiConfigured } = await import("../../src/lib/ai");
  if (!isPersonaAiConfigured()) {
    throw new Error("Persona AI is not configured.");
  }

  console.log(`PERSONA_SYNTHESIS_PROMPT_VERSION = ${PERSONA_SYNTHESIS_PROMPT_VERSION}`);
  console.log("Source: production DB personas + product evidence bundles (no synthetic peers)\n");

  const prisma = new PrismaClient();

  // --- SalesForecaster ---
  const sf = await loadProductContext(prisma, SF_PRODUCT_NAME);
  const sfPersonas = await prisma.persona.findMany({
    where: {
      productId: sf.product.id,
      archivedAt: null,
      approvalStatus: "APPROVED",
    },
    orderBy: { name: "asc" },
  });
  const sfCro = sfPersonas.find((p) => p.name === SF_CRO_NAME);
  const sfVp = sfPersonas.find((p) => p.name === SF_VP_SALES_NAME);
  if (!sfCro) throw new Error(`Missing persona: ${SF_CRO_NAME}`);
  if (!sfVp) throw new Error(`Missing persona: ${SF_VP_SALES_NAME}`);

  const sfPeers = peerSnapshot(
    sfPersonas.filter((p) => p.id !== sfCro.id),
  );

  console.log("(a) SalesForecaster peers loaded from DB:");
  for (const peer of sfPeers) {
    console.log(`  - ${peer.id} · ${peer.name}`);
  }
  console.log(`\nVP of Sales DB record (${sfVp.id}):`);
  console.log("  painPoints:", parsePersonaListField(sfVp.painPoints).join(" | ") || "(empty)");
  console.log(
    "  messagingNotes:",
    parsePersonaListField(sfVp.messagingNotes).join(" | ") || "(empty)",
  );

  const sfEvidence = selectProductEvidenceForPersona({
    roleName: sfCro.name,
    excerpts: sf.excerpts,
  });

  const rebuiltSfCro = await synthesizePersona({
    label: `(a) ${SF_PRODUCT_NAME} · ${SF_CRO_NAME} rebuild (DB peers: ${sfPeers.map((p) => p.name).join(", ")})`,
    productName: sf.product.name,
    productSnapshot: {
      name: sf.product.name,
      description: sf.product.description,
      valueProposition: sf.product.valueProposition,
      websiteUrl: sf.product.websiteUrl,
      profile: sf.product.profileJson,
    },
    productMessaging:
      (sf.product.messagingJson as Record<string, unknown> | null) ?? null,
    productEvidence: sfEvidence,
    buyerRole: buyerRoleFromPersona(sfCro),
    existingApprovedPersonas: sfPeers,
  });

  printFieldComparison(
    "painPoints",
    parsePersonaListField(sfCro.painPoints),
    rebuiltSfCro.painPoints,
  );
  printFieldComparison(
    "desiredOutcomesFromSolution",
    parsePersonaListField(sfCro.desiredOutcomes),
    rebuiltSfCro.desiredOutcomesFromSolution,
  );
  printFieldComparison(
    "messagingNotes",
    parsePersonaListField(sfCro.messagingNotes),
    rebuiltSfCro.messagingNotes ?? [],
  );

  // --- OT NOM ---
  const nom = await loadProductContext(prisma, NOM_PRODUCT_NAME);
  const nomPersonas = await prisma.persona.findMany({
    where: {
      productId: nom.product.id,
      archivedAt: null,
      approvalStatus: "APPROVED",
    },
    orderBy: { name: "asc" },
  });
  const nomTarget = nomPersonas.find((p) => p.name === NOM_TARGET_NAME);
  if (!nomTarget) throw new Error(`Missing persona: ${NOM_TARGET_NAME}`);

  const nomPeers = peerSnapshot(
    nomPersonas.filter((p) => p.id !== nomTarget.id),
  );

  console.log(`\n(b) ${NOM_PRODUCT_NAME} peers loaded from DB:`);
  for (const peer of nomPeers) {
    console.log(`  - ${peer.id} · ${peer.name}`);
  }

  const nomEvidence = selectProductEvidenceForPersona({
    roleName: nomTarget.name,
    excerpts: nom.excerpts,
  });

  const rebuiltNom = await synthesizePersona({
    label: `(b) ${NOM_PRODUCT_NAME} · ${NOM_TARGET_NAME} rebuild (DB peers: ${nomPeers.map((p) => p.name).join(", ")})`,
    productName: nom.product.name,
    productSnapshot: {
      name: nom.product.name,
      description: nom.product.description,
      valueProposition: nom.product.valueProposition,
      websiteUrl: nom.product.websiteUrl,
      profile: nom.product.profileJson,
    },
    productMessaging:
      (nom.product.messagingJson as Record<string, unknown> | null) ?? null,
    productEvidence: nomEvidence,
    buyerRole: buyerRoleFromPersona(nomTarget),
    existingApprovedPersonas: nomPeers,
  });

  printFieldComparison(
    "painPoints",
    parsePersonaListField(nomTarget.painPoints),
    rebuiltNom.painPoints,
  );
  printFieldComparison(
    "desiredOutcomesFromSolution",
    parsePersonaListField(nomTarget.desiredOutcomes),
    rebuiltNom.desiredOutcomesFromSolution,
  );
  printFieldComparison(
    "messagingNotes",
    parsePersonaListField(nomTarget.messagingNotes),
    rebuiltNom.messagingNotes ?? [],
  );

  const offDomainTerms = [
    "pharmacy",
    "dispensing",
    "clinical",
    "billing",
    "fulfillment",
    "forecast",
    "pipeline",
    "quota",
    "crm",
    "deal",
    "seller",
  ];
  const nomCoreText = [
    rebuiltNom.roleSummary ?? "",
    ...rebuiltNom.painPoints,
    ...rebuiltNom.ownershipAreas,
    ...rebuiltNom.primaryResponsibilities,
    ...(rebuiltNom.desiredOutcomesFromSolution ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const nomLeaks = offDomainTerms.filter((term) => nomCoreText.includes(term));
  const sfLeaksInNom = ["forecast", "pipeline", "quota", "crm", "deal", "seller"].filter(
    (term) => nomCoreText.includes(term),
  );
  console.log(
    `\nNOM core-field quality: ${
      nomLeaks.length === 0 && sfLeaksInNom.length === 0 ?
        "PASS — no off-domain bleed into Network Operations Leader core fields"
      : `WARN — terms in core fields: ${[...new Set([...nomLeaks, ...sfLeaksInNom])].join(", ")}`
    }`,
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

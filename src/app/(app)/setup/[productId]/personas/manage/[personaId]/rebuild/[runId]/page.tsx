import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonaResynthesisReview } from "@/components/PersonaResynthesisReview";
import { PageHeader, TenantMissing } from "@/components/ui";
import { listPersonaCriteria } from "@/lib/interpretation/persona";
import { prisma } from "@/lib/prisma";
import type { PersonaAiDraft } from "@/lib/persona-research/contract";
import {
  PERSONA_RESYNTHESIS_USER_CONTEXT_FLAG,
} from "@/lib/persona-research/resynthesize-approved";
import { personaTextSnapshot } from "@/lib/persona-research/resynthesize-approved-plan";
import { getPersona, getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { getResearchPolicy } from "@/lib/usage/policy";

type PageProps = {
  params: Promise<{ productId: string; personaId: string; runId: string }>;
};

export default async function PersonaResynthesisReviewPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId, personaId, runId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Rebuild persona" />
        <TenantMissing />
      </div>
    );
  }

  let product;
  let persona;
  try {
    product = await getProduct(productId);
    persona = await getPersona(personaId);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  if (persona.productId !== product.id) {
    notFound();
  }

  const run = await prisma.personaSetupRun.findFirst({
    where: {
      id: runId,
      organizationId: organization.id,
      productId: product.id,
      personaId: persona.id,
    },
  });
  if (!run) notFound();

  const userContext = run.userContextJson as Record<string, unknown> | null;
  if (!userContext?.[PERSONA_RESYNTHESIS_USER_CONTEXT_FLAG]) {
    notFound();
  }

  const researchPolicy = await getResearchPolicy(organization.id);
  const criteria = await listPersonaCriteria(organization.id, persona.id);
  const draft = (run.personaDraftJson as PersonaAiDraft | null) ?? null;
  const failed = run.status === "FAILED";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={`Rebuild: ${persona.name}`}
        description={`Review product-evidence rebuild for ${product.name}. Nothing changes until you confirm.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/personas?product=${product.id}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
            >
              All personas
            </Link>
            <Link
              href={`/setup/${product.id}/personas/manage/${persona.id}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
            >
              Back to persona
            </Link>
          </div>
        }
      />
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <PersonaResynthesisReview
          productId={product.id}
          personaId={persona.id}
          personaName={persona.name}
          personaSetupRunId={run.id}
          draft={draft}
          failed={failed}
          errorSafe={run.errorSafe}
          beforeSnapshot={personaTextSnapshot(persona)}
          manuallyEditedFields={persona.manuallyEditedFields}
          targetTitles={persona.targetTitles}
          existingCriteria={criteria.map((c) => ({
            id: c.id ?? "",
            name: c.name,
            criterionType: c.criterionType,
            manuallyEdited: Boolean(c.manuallyEdited),
          }))}
          maxProjectedPersonaCriteria={researchPolicy.maxProjectedPersonaCriteria}
        />
      </section>
    </div>
  );
}

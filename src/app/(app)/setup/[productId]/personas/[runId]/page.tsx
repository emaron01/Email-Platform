import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonaDraftReview } from "@/components/PersonaDraftReview";
import { PageHeader, TenantMissing } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import type { PersonaAiDraft } from "@/lib/persona-research/contract";
import { getResearchPolicy } from "@/lib/usage/policy";

type PageProps = {
  params: Promise<{ productId: string; runId: string }>;
};

export default async function PersonaSetupRunPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId, runId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Persona review" />
        <TenantMissing />
      </div>
    );
  }

  let product;
  try {
    product = await getProduct(productId);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const run = await prisma.personaSetupRun.findFirst({
    where: {
      id: runId,
      organizationId: organization.id,
      productId: product.id,
    },
  });
  if (!run) notFound();

  const researchPolicy = await getResearchPolicy(organization.id);

  const draft = (run.personaDraftJson as PersonaAiDraft | null) ?? null;
  const failed = run.status === "FAILED";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Persona draft: ${product.name}`}
        description="Review and save to make this Persona authoritative."
        actions={
          <Link
            href={`/setup/${product.id}/research`}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
          >
            Suggested roles
          </Link>
        }
      />
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <PersonaDraftReview
          productId={product.id}
          personaSetupRunId={run.id}
          draft={draft}
          failed={failed}
          errorSafe={run.errorSafe}
          maxProjectedPersonaCriteria={researchPolicy.maxProjectedPersonaCriteria}
        />
      </section>
    </div>
  );
}

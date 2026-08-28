import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonaForm } from "@/components/PersonaForm";
import { PageHeader, TenantMissing } from "@/components/ui";
import { listPersonaCriteria } from "@/lib/interpretation/persona";
import { prisma } from "@/lib/prisma";
import { getPersona, getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";

type PageProps = {
  params: Promise<{ productId: string; personaId: string }>;
};

export default async function ManagePersonaPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId, personaId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Persona" />
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

  const criteria = await listPersonaCriteria(organization.id, persona.id);

  const sources = await prisma.personaSource.findMany({
    where: {
      organizationId: organization.id,
      OR: [
        { personaId: persona.id },
        ...(persona.approvedPersonaSetupRunId
          ? [{ personaSetupRunId: persona.approvedPersonaSetupRunId }]
          : []),
      ],
    },
    select: {
      id: true,
      sourceType: true,
      displayName: true,
      originalUrl: true,
      filename: true,
      provenanceClass: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let includesProductEvidence = false;
  if (persona.approvedPersonaSetupRunId) {
    const run = await prisma.personaSetupRun.findFirst({
      where: {
        id: persona.approvedPersonaSetupRunId,
        organizationId: organization.id,
      },
      select: { productEvidenceBundleId: true },
    });
    includesProductEvidence = Boolean(run?.productEvidenceBundleId);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={persona.name}
        description={`Buyer role for ${product.name}.`}
        actions={
          <Link
            href={`/setup/${product.id}`}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
          >
            Back to overview
          </Link>
        }
      />
      <PersonaForm
        productId={product.id}
        persona={persona}
        criteria={criteria}
        sources={sources}
        includesProductEvidence={includesProductEvidence}
      />
    </div>
  );
}

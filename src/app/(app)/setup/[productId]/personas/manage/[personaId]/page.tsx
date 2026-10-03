import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonaForm } from "@/components/PersonaForm";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { listPersonaCriteria } from "@/lib/interpretation/persona";
import { prisma } from "@/lib/prisma";
import { getPersona, getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";

type PageProps = {
  params: Promise<{ productId: string; personaId: string }>;
  searchParams: Promise<{ edit?: string }>;
};

export default async function ManagePersonaPage({
  params,
  searchParams,
}: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId, personaId } = await params;
  const { edit } = await searchParams;

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

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={persona.name}
        description={`Buyer role for ${product.name}.`}
        actions={
          <Link
            href={`/setup/${product.id}`}
            className={SECONDARY_BUTTON_CLASS}
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
        startInReview={edit === "review"}
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonaForm } from "@/components/PersonaForm";
import { PageHeader, TenantMissing } from "@/components/ui";
import { listPersonaCriteria } from "@/lib/interpretation/persona";
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
        <PageHeader title="Edit persona" />
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

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Edit persona: ${persona.name}`}
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
      />
    </div>
  );
}

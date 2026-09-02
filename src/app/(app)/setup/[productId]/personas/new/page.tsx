import Link from "next/link";
import { notFound } from "next/navigation";
import { BuildPersonaForm } from "@/components/BuildPersonaForm";
import { PageHeader, TenantMissing } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import type { SuggestedBuyerRole } from "@/lib/product-research/contract";

type PageProps = {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ role?: string }>;
};

export default async function NewPersonaPage({
  params,
  searchParams,
}: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId } = await params;
  const { role: roleKey } = await searchParams;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Build Persona" />
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

  if (product.approvalStatus !== "APPROVED") {
    return (
      <div className="space-y-4">
        <PageHeader title="Build Persona" />
        <p className="text-sm text-slate-600">
          Approve the Product before building Personas.
        </p>
        <Link href={`/setup/${product.id}/research`} className="underline">
          Back to Product research
        </Link>
      </div>
    );
  }

  let role: SuggestedBuyerRole | null = null;
  if (roleKey && product.approvedSetupRunId) {
    const run = await prisma.productSetupRun.findFirst({
      where: {
        id: product.approvedSetupRunId,
        organizationId: organization.id,
        productId: product.id,
      },
    });
    const roles =
      (run?.suggestedPersonasJson as SuggestedBuyerRole[] | null) ?? [];
    role = roles.find((r) => r.suggestionKey === roleKey) ?? null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={role ? `Build Persona: ${product.name}` : `New persona: ${product.name}`}
        description={
          role
            ? "Reuses Product evidence. Runs Persona research only when the role is ambiguous or thin."
            : "Name the buyer role and add any context you have. Synthesis builds the persona from product evidence and peer differentiation — then you review and edit."
        }
        actions={
          <Link
            href={`/setup/${product.id}/research`}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
          >
            Back
          </Link>
        }
      />
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <BuildPersonaForm productId={product.id} role={role} />
      </section>
    </div>
  );
}

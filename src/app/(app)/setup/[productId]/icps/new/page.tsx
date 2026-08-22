import Link from "next/link";
import { notFound } from "next/navigation";
import { IcpDetailsForm } from "@/components/IcpDetailsForm";
import { PageHeader, TenantMissing } from "@/components/ui";
import { getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";

type PageProps = {
  params: Promise<{ productId: string }>;
};

export default async function NewIcpPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Add ICP" />
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

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add ICP"
        description={`Ideal customer profile for ${product.name}.`}
        actions={
          <Link
            href={`/setup/${product.id}`}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
          >
            Back to overview
          </Link>
        }
      />
      <IcpDetailsForm
        productId={product.id}
        productName={product.name}
        criteria={[]}
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductDetailsForm } from "@/components/ProductDetailsForm";
import { PageHeader, TenantMissing } from "@/components/ui";
import { getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";

type PageProps = {
  params: Promise<{ productId: string }>;
};

export default async function EditProductPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Edit product" />
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
        title={`Edit: ${product.name}`}
        description="Update product details."
        actions={
          <Link
            href={`/setup/${product.id}`}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
          >
            Back to overview
          </Link>
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <ProductDetailsForm product={product} />
      </div>
    </div>
  );
}

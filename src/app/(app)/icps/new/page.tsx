import Link from "next/link";
import { ProductContinuePicker } from "@/components/ProductContinuePicker";
import { PageHeader, TenantMissing } from "@/components/ui";
import { listProducts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

export default async function NewIcpPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const organization = await getCurrentOrganization();
  const query = await searchParams;
  const requestedProductId = query.product?.trim() || null;

  if (!organization) {
    return (
      <div>
        <PageHeader
          title="New ICP"
          description="Create an ideal customer profile."
        />
        <TenantMissing />
      </div>
    );
  }

  const products = await listProducts();
  const initialProductId =
    requestedProductId &&
    products.some((product) => product.id === requestedProductId)
      ? requestedProductId
      : products.length === 1
        ? products[0]!.id
        : null;

  return (
    <div>
      <PageHeader
        title="New ICP"
        description="Choose which product this ICP belongs to, then continue to define and interpret it."
        actions={
          <Link
            href="/icps"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
          >
            Back to ICPs
          </Link>
        }
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        {products.length === 0 ? (
          <p className="text-sm text-slate-600">
            Add a product on the{" "}
            <Link href="/products/new" className="underline">
              Products page
            </Link>{" "}
            before creating an ICP.
          </p>
        ) : (
          <ProductContinuePicker
            products={products.map((product) => ({
              id: product.id,
              name: product.name,
            }))}
            initialProductId={initialProductId}
            continuePathTemplate="/setup/{productId}/icps/new"
            continueLabel="Continue to ICP setup"
          />
        )}
      </section>
    </div>
  );
}

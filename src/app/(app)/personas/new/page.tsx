import Link from "next/link";
import { ProductContinuePicker } from "@/components/ProductContinuePicker";
import { PageHeader, TenantMissing } from "@/components/ui";
import { listProducts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

export default async function NewPersonaPage({
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
          title="New persona"
          description="Build a buyer persona."
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
        title="New persona"
        description="Choose which product this persona belongs to, then continue to build it from suggested roles or from scratch."
        actions={
          <Link
            href="/personas"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
          >
            Back to personas
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
            before building a persona.
          </p>
        ) : (
          <ProductContinuePicker
            products={products.map((product) => ({
              id: product.id,
              name: product.name,
            }))}
            initialProductId={initialProductId}
            continueHref={(productId) => `/setup/${productId}#personas`}
            continueLabel="Continue to persona setup"
          />
        )}
      </section>
    </div>
  );
}

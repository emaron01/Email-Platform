import Link from "next/link";
import { Suspense } from "react";
import { ArtifactProductFilter } from "@/components/ArtifactProductFilter";
import { EmptyState, PageHeader, TenantMissing } from "@/components/ui";
import { listPersonas, listProducts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

export default async function PersonasPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const organization = await getCurrentOrganization();
  const query = await searchParams;
  const productId = query.product?.trim() || null;

  if (!organization) {
    return (
      <div>
        <PageHeader
          title="Personas"
          description="Buyer personas across your products."
        />
        <TenantMissing />
      </div>
    );
  }

  const [products, personas] = await Promise.all([
    listProducts(),
    listPersonas(productId ?? undefined),
  ]);
  const productNameById = new Map(products.map((product) => [product.id, product.name]));

  return (
    <div>
      <PageHeader
        title="Personas"
        description="Org-wide persona list. Open a persona to manage titles, criteria, and rebuilds."
        actions={
          productId ? (
            <Link
              href={`/setup/${productId}#personas`}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white"
            >
              Build persona
            </Link>
          ) : null
        }
      />

      <div className="mb-6">
        <Suspense fallback={null}>
          <ArtifactProductFilter
            products={products.map((product) => ({
              id: product.id,
              name: product.name,
            }))}
            selectedProductId={productId}
          />
        </Suspense>
      </div>

      {personas.length === 0 ? (
        <EmptyState
          title="No personas yet"
          description={
            productId
              ? "Build a persona for this product, or clear the filter to see other products."
              : "Create a product and ICP first, then build personas from the product setup flow."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Persona</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {personas.map((persona) => (
                <tr key={persona.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link
                      href={`/setup/${persona.productId}/personas/manage/${persona.id}`}
                      className="hover:underline"
                    >
                      {persona.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {productNameById.get(persona.productId) ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/setup/${persona.productId}/personas/manage/${persona.id}`}
                      className="text-slate-700 underline"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

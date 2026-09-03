import Link from "next/link";
import { DeleteSuccessNotice } from "@/components/DeleteSuccessNotice";
import { EmptyState, PageHeader, TenantMissing } from "@/components/ui";
import { ProductCatalogPanel } from "@/components/ProductCatalogPanel";
import { listProductsWithCounts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

export default async function ProductsPage() {
  const organization = await getCurrentOrganization();

  if (!organization) {
    return (
      <div>
        <PageHeader
          title="Products"
          description="Define products, then attach ICPs and personas to each product."
        />
        <TenantMissing />
      </div>
    );
  }

  const products = await listProductsWithCounts();

  return (
    <div>
      <PageHeader
        title="Products"
        description="Products are reusable. Each product has its own ICPs and personas. Offers are defined later on each campaign."
        actions={
          <Link
            href="/products/new"
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white"
          >
            New product
          </Link>
        }
      />

      <DeleteSuccessNotice />

      {products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="A product is what you sell — research it once, then define the ICPs and personas that belong to it."
          actions={
            <Link
              href="/products/new"
              className="inline-flex rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              New product
            </Link>
          }
        />
      ) : (
        <ProductCatalogPanel products={products} />
      )}
    </div>
  );
}

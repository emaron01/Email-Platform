import Link from "next/link";
import { DeleteSuccessNotice } from "@/components/DeleteSuccessNotice";
import { EmptyState, PageHeader, PRIMARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { cn } from "@/lib/utils";
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
            className={PRIMARY_BUTTON_CLASS}
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
              className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
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

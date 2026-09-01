import { PageHeader, TenantMissing } from "@/components/ui";
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
      />
      <ProductCatalogPanel products={products} />
    </div>
  );
}

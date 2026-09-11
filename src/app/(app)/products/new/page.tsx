import Link from "next/link";
import { AssistedProductIntake } from "@/components/AssistedProductSetup";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

export default async function NewProductPage() {
  const organization = await getCurrentOrganization();

  if (!organization) {
    return (
      <div>
        <PageHeader
          title="New product"
          description="Create a product for the active organization."
        />
        <TenantMissing />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="New product"
        description="Name the product and supply materials you already use. Research builds a draft profile and suggested buyer roles for your review."
        actions={
          <Link
            href="/products"
            className={SECONDARY_BUTTON_CLASS}
          >
            Back to products
          </Link>
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <AssistedProductIntake />
      </div>
    </div>
  );
}

import Link from "next/link";
import { AssistedProductIntake } from "@/components/AssistedProductSetup";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

export default async function NewProductAssistedPage() {
  const organization = await getCurrentOrganization();
  if (!organization) {
    return (
      <div>
        <PageHeader title="New Product" />
        <TenantMissing />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="New Product"
        description="Provide a name and optional sources. Research builds Product and Persona drafts for your review."
        actions={
          <Link
            href="/products"
            className={SECONDARY_BUTTON_CLASS}
          >
            All products
          </Link>
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <AssistedProductIntake />
      </div>
    </div>
  );
}

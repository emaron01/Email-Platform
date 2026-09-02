import Link from "next/link";
import { AssistedProductIntake } from "@/components/AssistedProductSetup";
import { PageHeader, TenantMissing } from "@/components/ui";
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
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
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

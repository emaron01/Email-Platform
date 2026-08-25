import Link from "next/link";
import { notFound } from "next/navigation";
import { ScoreListForm } from "@/components/ScoreListForm";
import {
  PageHeader,
  Panel,
  TenantMissing,
} from "@/components/ui";
import {
  getContactList,
  listIcps,
  listPersonas,
  listProducts,
} from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ScoreListPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { id } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Score List" description="Create a scoring run." />
        <TenantMissing />
      </div>
    );
  }

  let list;
  try {
    list = await getContactList(id);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const [products, icps, personas] = await Promise.all([
    listProducts(),
    listIcps(),
    listPersonas(),
  ]);

  const readyProducts = products.filter((product) => {
    const hasIcp = icps.some((icp) => icp.productId === product.id);
    const hasPersona = personas.some(
      (persona) => persona.productId === product.id,
    );
    return hasIcp && hasPersona;
  });

  return (
    <div>
      <PageHeader
        title={`Score: ${list.name}`}
        description="Select Product → ICP → Persona. Default is All personas so mixed lists are scored against every buyer role."
        actions={
          <Link
            href={`/lists/${id}`}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Back to list
          </Link>
        }
      />

      <Panel
        title="Create Scoring Run"
        description="No AI scoring runs yet. This creates the report framework with pending/null score fields."
      >
        {readyProducts.length === 0 ? (
          <p className="text-sm text-slate-600">
            Add a Product with at least one ICP and one Persona on the Setup page
            first.
          </p>
        ) : (
          <ScoreListForm
            contactListId={list.id}
            products={readyProducts.map((product) => ({
              id: product.id,
              name: product.name,
            }))}
            icps={icps.map((icp) => ({
              id: icp.id,
              name: icp.name,
              productId: icp.productId,
            }))}
            personas={personas.map((persona) => ({
              id: persona.id,
              name: persona.name,
              productId: persona.productId,
            }))}
          />
        )}
      </Panel>
    </div>
  );
}

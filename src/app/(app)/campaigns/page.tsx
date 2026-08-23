import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  Panel,
  TenantMissing,
} from "@/components/ui";
import { NewCampaignForm } from "@/components/NewCampaignForm";
import {
  listCampaigns,
  listIcps,
  listPersonas,
  listProducts,
} from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { formatDate } from "@/lib/utils";

export default async function CampaignsPage() {
  const organization = await getCurrentOrganization();

  if (!organization) {
    return (
      <div>
        <PageHeader
          title="Campaigns"
          description="Campaigns belonging to the active organization."
        />
        <TenantMissing />
      </div>
    );
  }

  const [campaigns, products, icps, personas] = await Promise.all([
    listCampaigns(),
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

  const canCreate = readyProducts.length > 0;

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Each campaign selects one Product, one ICP, one Persona, and a campaign-specific Offer."
      />

      <div className="mb-6">
        <Panel
          title="New Campaign"
          description="ICP and Persona options are filtered by the selected Product. Relationships are validated server-side."
        >
          {canCreate ? (
            <NewCampaignForm
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
          ) : (
            <p className="text-sm text-slate-600">
              Add a Product with at least one ICP and one Persona on the Setup
              page before creating a campaign.
            </p>
          )}
        </Panel>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create a campaign above, then attach contacts and generate drafts from its detail page."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Campaign Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">ICP</th>
                <th className="px-4 py-3 font-medium">Persona</th>
                <th className="px-4 py-3 font-medium">Offer</th>
                <th className="px-4 py-3 font-medium">Contacts</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {campaign.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {campaign.status}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {campaign.product.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {campaign.icp.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {campaign.persona.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {campaign.offerName ?? campaign.offer?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {campaign._count.contacts}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(campaign.createdAt)}
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

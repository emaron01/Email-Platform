import { Fragment } from "react";
import {
  EmptyState,
  PageHeader,
  Panel,
  TenantMissing,
} from "@/components/ui";
import { NewCampaignForm } from "@/components/NewCampaignForm";
import { GenerateEmailDraftForm } from "@/components/GenerateEmailDraftForm";
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
          description="Create a campaign above. Email drafts are not generated in this phase."
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
                <Fragment key={campaign.id}>
                  <tr>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {campaign.name}
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
                  {campaign.contacts.length > 0 ? (
                    <tr className="bg-slate-50/60">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="space-y-4">
                          {campaign.contacts.map((campaignContact) => {
                            const contact = campaignContact.contact;
                            const displayName =
                              [contact.firstName, contact.lastName]
                                .filter(Boolean)
                                .join(" ") ||
                              contact.email ||
                              "Unnamed contact";
                            const draft = campaignContact.emailDrafts[0];

                            return (
                              <section
                                key={campaignContact.id}
                                className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
                              >
                                <div className="text-sm">
                                  <p className="font-medium text-slate-900">
                                    {displayName}
                                  </p>
                                  <p className="text-slate-600">
                                    {[contact.title, contact.company]
                                      .filter(Boolean)
                                      .join(" · ") || "No role details"}
                                  </p>
                                  {contact.email ? (
                                    <p className="text-slate-500">
                                      {contact.email}
                                    </p>
                                  ) : null}
                                </div>
                                <GenerateEmailDraftForm
                                  campaignContactId={campaignContact.id}
                                  existingDraft={
                                    draft?.subject && draft.body
                                      ? {
                                          draftId: draft.id,
                                          subject: draft.subject,
                                          body: draft.body,
                                        }
                                      : null
                                  }
                                />
                              </section>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

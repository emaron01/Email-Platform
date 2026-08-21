import Link from "next/link";
import { notFound } from "next/navigation";
import type { Icp, Product } from "@prisma/client";
import {
  deleteIcpAction,
  deleteProductAction,
  upsertIcpAction,
  upsertProductAction,
} from "@/app/actions";
import { interpretIcpAction } from "@/app/actions/interpretation";
import { PersonaForm } from "@/components/PersonaForm";
import {
  EmptyState,
  Field,
  PageHeader,
  Panel,
  SecondaryButton,
  SubmitButton,
  TenantMissing,
} from "@/components/ui";
import { formatCriterionDisplay } from "@/lib/criteria/types";
import { listIcpCriteria } from "@/lib/interpretation/icp";
import { listPersonaCriteria } from "@/lib/interpretation/persona";
import { getProduct, listIcps, listPersonas } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { listToCommaString } from "@/lib/utils";

type PageProps = {
  params: Promise<{ productId: string }>;
};

export default async function SetupProductPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Product" description="Manage product setup." />
        <TenantMissing />
      </div>
    );
  }

  let product: Product;
  try {
    product = await getProduct(productId);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const [icps, personas] = await Promise.all([
    listIcps(product.id),
    listPersonas(product.id),
  ]);

  const icpCriteriaMap = new Map<
    string,
    Awaited<ReturnType<typeof listIcpCriteria>>
  >();
  const personaCriteriaMap = new Map<
    string,
    Awaited<ReturnType<typeof listPersonaCriteria>>
  >();
  await Promise.all([
    ...icps.map(async (icp) => {
      icpCriteriaMap.set(
        icp.id,
        await listIcpCriteria(organization.id, icp.id),
      );
    }),
    ...personas.map(async (persona) => {
      personaCriteriaMap.set(
        persona.id,
        await listPersonaCriteria(organization.id, persona.id),
      );
    }),
  ]);

  return (
    <div>
      <PageHeader
        title={product.name}
        description="Describe ideal customers and buyers in natural language. AI interprets structured criteria for research and scoring."
        actions={
          <Link
            href="/setup"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            All products
          </Link>
        }
      />

      <div className="space-y-6">
        <Panel
          title="Product Details"
          description="Edit this product’s core information."
        >
          <ProductForm product={product} />
          <form action={deleteProductAction} className="mt-4">
            <input type="hidden" name="id" value={product.id} />
            <SecondaryButton type="submit">Delete product</SecondaryButton>
          </form>
        </Panel>

        <Panel
          title="ICPs"
          description="Describe what kind of company should buy this product."
        >
          <div className="space-y-4">
            {icps.length === 0 ? (
              <EmptyState
                title="No ICPs yet"
                description="Add an ICP for this product."
              />
            ) : (
              icps.map((icp) => (
                <IcpForm
                  key={icp.id}
                  productId={product.id}
                  icp={icp}
                  criteria={icpCriteriaMap.get(icp.id) ?? []}
                />
              ))
            )}
            <div className="border-t border-slate-200 pt-4">
              <h4 className="mb-3 text-sm font-semibold text-slate-900">
                + Add ICP
              </h4>
              <IcpForm productId={product.id} criteria={[]} />
            </div>
          </div>
        </Panel>

        <Panel
          title="Personas"
          description="Describe who inside the company buys or cares. Titles are evidence — roles drive fit."
        >
          <div className="space-y-4">
            {personas.length === 0 ? (
              <EmptyState
                title="No personas yet"
                description="Add a persona for this product."
              />
            ) : (
              personas.map((persona) => (
                <PersonaForm
                  key={persona.id}
                  productId={product.id}
                  persona={persona}
                  criteria={personaCriteriaMap.get(persona.id) ?? []}
                />
              ))
            )}
            <div className="border-t border-slate-200 pt-4">
              <h4 className="mb-3 text-sm font-semibold text-slate-900">
                + Add Persona
              </h4>
              <PersonaForm productId={product.id} criteria={[]} />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ProductForm({ product }: { product: Product }) {
  return (
    <form action={upsertProductAction} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="id" value={product.id} />
      <Field label="Product Name" name="name" defaultValue={product.name} required />
      <Field
        label="Website URL"
        name="websiteUrl"
        defaultValue={product.websiteUrl}
        placeholder="https://"
      />
      <div className="md:col-span-2">
        <Field
          label="Product Description"
          name="description"
          defaultValue={product.description}
          as="textarea"
        />
      </div>
      <div className="md:col-span-2">
        <Field
          label="Primary Value Proposition"
          name="valueProposition"
          defaultValue={product.valueProposition}
          as="textarea"
        />
      </div>
      <Field
        label="Typical Price / AOV"
        name="averageOrderValue"
        type="number"
        defaultValue={
          product.averageOrderValue != null
            ? Number(product.averageOrderValue)
            : ""
        }
      />
      <div className="flex items-end">
        <SubmitButton>Save product</SubmitButton>
      </div>
    </form>
  );
}

function CriteriaReview({
  title,
  criteria,
}: {
  title: string;
  criteria: Array<{
    name: string;
    importance: string;
    isDisqualifier: boolean;
    isRequired: boolean;
    manuallyEdited?: boolean;
    dataType: string;
    operator: string;
    targetValue?: unknown;
    minValue?: unknown;
    maxValue?: unknown;
    sortOrder: number;
    criterionType: string;
  }>;
}) {
  if (criteria.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate-500">
        No structured criteria yet. Save a natural-language definition, then run
        AI Interpretation.
      </p>
    );
  }
  return (
    <div className="mt-4 rounded-md bg-slate-50 p-3">
      <h5 className="text-sm font-semibold text-slate-900">{title}</h5>
      <p className="mt-1 text-xs text-slate-500">
        ✓ required / strong · ☆ supporting · ✗ disqualifier
      </p>
      <ul className="mt-2 space-y-1 text-sm text-slate-700">
        {criteria.map((c, i) => (
          <li key={`${c.name}-${i}`}>
            {c.isDisqualifier ? "✗" : c.isRequired ? "✓" : "☆"}{" "}
            {formatCriterionDisplay({
              ...c,
              dataType: c.dataType as never,
              operator: c.operator as never,
              importance: c.importance as never,
            })}
            {c.manuallyEdited ? (
              <span className="ml-2 text-xs text-amber-700">(manual)</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function IcpForm({
  productId,
  icp,
  criteria,
}: {
  productId: string;
  icp?: Icp;
  criteria: Awaited<ReturnType<typeof listIcpCriteria>>;
}) {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <form action={upsertIcpAction} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="id" value={icp?.id ?? ""} />
        <input type="hidden" name="productId" value={productId} />
        <Field label="ICP Name" name="name" defaultValue={icp?.name} required />
        <Field
          label="Target Industries"
          name="targetIndustries"
          defaultValue={listToCommaString(icp?.targetIndustries)}
          placeholder="SaaS, Manufacturing"
        />
        <div className="md:col-span-2">
          <Field
            label="Describe your ideal customer"
            name="definition"
            defaultValue={icp?.definition ?? icp?.description}
            as="textarea"
            placeholder="Commercial real-estate companies in the Northeast with at least $50M revenue that own 25+ buildings..."
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Additional context (optional)"
            name="additionalContext"
            defaultValue={icp?.additionalContext}
            as="textarea"
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Short description (optional)"
            name="description"
            defaultValue={icp?.description}
            as="textarea"
          />
        </div>
        <Field
          label="Minimum Employees"
          name="minEmployees"
          type="number"
          defaultValue={icp?.minEmployees}
        />
        <Field
          label="Maximum Employees"
          name="maxEmployees"
          type="number"
          defaultValue={icp?.maxEmployees}
        />
        <Field
          label="Minimum Revenue"
          name="minRevenue"
          type="number"
          defaultValue={icp?.minRevenue != null ? Number(icp.minRevenue) : ""}
        />
        <Field
          label="Maximum Revenue"
          name="maxRevenue"
          type="number"
          defaultValue={icp?.maxRevenue != null ? Number(icp.maxRevenue) : ""}
        />
        <Field
          label="Target Geographies"
          name="targetGeographies"
          defaultValue={listToCommaString(icp?.targetGeographies)}
        />
        <Field
          label="Required Technologies"
          name="requiredTechnologies"
          defaultValue={listToCommaString(icp?.requiredTechnologies)}
        />
        <Field
          label="Positive Buying Signals"
          name="positiveSignals"
          defaultValue={listToCommaString(icp?.positiveSignals)}
        />
        <Field
          label="Negative / Disqualifying Signals"
          name="negativeSignals"
          defaultValue={listToCommaString(icp?.negativeSignals)}
        />
        <div className="md:col-span-2">
          <Field
            label="Additional Notes"
            name="notes"
            defaultValue={icp?.notes}
            as="textarea"
          />
        </div>
        <div className="md:col-span-2">
          <SubmitButton>{icp ? "Save ICP" : "Add ICP"}</SubmitButton>
        </div>
      </form>
      {icp ? (
        <>
          <CriteriaReview title="AI Interpretation" criteria={criteria} />
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={interpretIcpAction}>
              <input type="hidden" name="icpId" value={icp.id} />
              <input type="hidden" name="productId" value={productId} />
              <SecondaryButton type="submit">
                Interpret / Reinterpret ICP
              </SecondaryButton>
            </form>
            <form action={deleteIcpAction}>
              <input type="hidden" name="id" value={icp.id} />
              <input type="hidden" name="productId" value={productId} />
              <SecondaryButton type="submit">Delete ICP</SecondaryButton>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}

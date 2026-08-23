"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createCampaignAction } from "@/app/actions";
import type { CampaignActionResult } from "@/lib/campaign/save";
import { Field, SubmitButton } from "@/components/ui";

type Option = { id: string; name: string; productId: string };

const initial: CampaignActionResult | null = null;

export function NewCampaignForm({
  products,
  icps,
  personas,
}: {
  products: Array<{ id: string; name: string }>;
  icps: Option[];
  personas: Option[];
}) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [icpId, setIcpId] = useState("");
  const [personaId, setPersonaId] = useState("");
  const [state, formAction, pending] = useActionState(
    createCampaignAction,
    initial,
  );

  const restored = state && !state.ok ? state.values : undefined;
  const formKey =
    state && !state.ok
      ? `campaign-fail-${state.message}-${restored?.name?.slice(0, 24) ?? ""}`
      : "campaign-new";

  const productIcps = useMemo(
    () => icps.filter((icp) => icp.productId === productId),
    [icps, productId],
  );
  const productPersonas = useMemo(
    () => personas.filter((persona) => persona.productId === productId),
    [personas, productId],
  );

  const canSubmit =
    Boolean(productId) &&
    Boolean(icpId) &&
    Boolean(personaId) &&
    productIcps.some((icp) => icp.id === icpId) &&
    productPersonas.some((persona) => persona.id === personaId);

  useEffect(() => {
    if (!state?.ok) return;
    router.push("/campaigns");
    router.refresh();
  }, [state, router]);

  useEffect(() => {
    if (!restored) return;
    if (restored.productId) setProductId(restored.productId);
    if (restored.icpId) setIcpId(restored.icpId);
    if (restored.personaId) setPersonaId(restored.personaId);
  }, [restored]);

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid gap-4 md:grid-cols-2"
    >
      {state ? (
        <p
          role="status"
          data-testid="campaign-action-status"
          className={
            state.ok
              ? "md:col-span-2 text-sm text-emerald-700"
              : "md:col-span-2 text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      ) : null}
      <Field
        label="Campaign Name"
        name="name"
        required
        defaultValue={restored?.name}
      />

      <label className="block text-sm">
        <span className="font-medium text-slate-700">Product</span>
        <select
          name="productId"
          required
          value={productId}
          onChange={(event) => {
            setProductId(event.target.value);
            setIcpId("");
            setPersonaId("");
          }}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2"
        >
          <option value="" disabled>
            Select product
          </option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="font-medium text-slate-700">ICP</span>
        <select
          name="icpId"
          required
          value={icpId}
          disabled={!productId}
          onChange={(event) => setIcpId(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2 disabled:bg-slate-50"
        >
          <option value="" disabled>
            {productId ? "Select ICP" : "Select a product first"}
          </option>
          {productIcps.map((icp) => (
            <option key={icp.id} value={icp.id}>
              {icp.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="font-medium text-slate-700">Persona</span>
        <select
          name="personaId"
          required
          value={personaId}
          disabled={!productId}
          onChange={(event) => setPersonaId(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2 disabled:bg-slate-50"
        >
          <option value="" disabled>
            {productId ? "Select persona" : "Select a product first"}
          </option>
          {productPersonas.map((persona) => (
            <option key={persona.id} value={persona.id}>
              {persona.name}
            </option>
          ))}
        </select>
      </label>

      <div className="md:col-span-2 border-t border-slate-200 pt-4">
        <p className="mb-3 text-sm font-medium text-slate-900">
          Campaign offer
        </p>
        <p className="mb-4 text-sm text-slate-600">
          Offers are campaign-specific. The same product, ICP, and persona can
          use different offers across campaigns.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Offer Name"
            name="offerName"
            placeholder="Free Forecast Audit"
            defaultValue={restored?.offerName}
          />
          <Field
            label="Primary CTA"
            name="offerCta"
            placeholder="Book a demo"
            defaultValue={restored?.offerCta}
          />
          <div className="md:col-span-2">
            <Field
              label="Offer Description"
              name="offerDescription"
              as="textarea"
              defaultValue={restored?.offerDescription}
            />
          </div>
          <div className="md:col-span-2">
            <Field
              label="Offer Notes"
              name="offerNotes"
              as="textarea"
              defaultValue={restored?.offerNotes}
            />
          </div>
        </div>
      </div>

      <div className="md:col-span-2">
        <SubmitButton disabled={!canSubmit || pending}>
          {pending
            ? "Creating…"
            : canSubmit
              ? "Create campaign"
              : "Select product, ICP, and persona"}
        </SubmitButton>
      </div>
    </form>
  );
}

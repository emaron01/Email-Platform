"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createCampaignAction } from "@/app/actions";
import {
  DEFAULT_EMAIL_LENGTH,
  EMAIL_GUIDANCE_MAX_CHARS,
  EMAIL_LENGTH_OPTIONS,
  type CampaignActionResult,
} from "@/lib/campaign/save";
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
  const [personaIds, setPersonaIds] = useState<string[]>([]);
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

  const allProductPersonasSelected =
    productPersonas.length > 0 &&
    productPersonas.every((persona) => personaIds.includes(persona.id));
  const canSubmit =
    Boolean(productId) &&
    Boolean(icpId) &&
    productIcps.some((icp) => icp.id === icpId);

  useEffect(() => {
    if (!state?.ok) return;
    router.push(state.campaignId ? `/campaigns/${state.campaignId}` : "/");
    router.refresh();
  }, [state, router]);

  useEffect(() => {
    if (!restored) return;
    if (restored.productId) setProductId(restored.productId);
    if (restored.icpId) setIcpId(restored.icpId);
    if (restored.allPersonas) {
      setPersonaIds(
        personas
          .filter((persona) => persona.productId === restored.productId)
          .map((persona) => persona.id),
      );
    } else if (restored.personaIds.length > 0) {
      setPersonaIds(restored.personaIds);
    } else if (restored.personaId) {
      setPersonaIds([restored.personaId]);
    }
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
      {state?.offerConflicts?.length ? (
        <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 md:col-span-2">
          <p className="text-sm font-medium text-amber-900">
            Review offer conflicts
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
            {state.offerConflicts.map((conflict) => (
              <li key={`${conflict.code}-${conflict.message}`}>
                {conflict.message}
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2 text-sm text-amber-950">
            <input
              type="checkbox"
              name="acknowledgeOfferConflicts"
              value="1"
              className="mt-0.5"
            />
            <span>
              Keep this offer anyway. I understand it differs from the current
              product claims or evidence.
            </span>
          </label>
        </div>
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
            setPersonaIds(
              personas
                .filter((persona) => persona.productId === event.target.value)
                .map((persona) => persona.id),
            );
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

      <fieldset className="block text-sm md:col-span-2">
        <legend className="font-medium text-slate-700">Personas in play</legend>
        <p className="mt-1 text-xs text-slate-500">
          Defaults to every persona for this product. Persona is a property of
          the contact; this only limits which roles the campaign will email.
        </p>
        {allProductPersonasSelected ? (
          <input type="hidden" name="allPersonas" value="1" />
        ) : null}
        <div className="mt-2 space-y-2">
          {!productId ? (
            <p className="text-sm text-slate-500">Select a product first</p>
          ) : productPersonas.length === 0 ? (
            <p className="text-sm text-slate-500">
              This product has no personas yet.
            </p>
          ) : (
            productPersonas.map((persona) => (
              <label
                key={persona.id}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  name="personaIds"
                  value={persona.id}
                  checked={personaIds.includes(persona.id)}
                  onChange={(event) => {
                    setPersonaIds((current) =>
                      event.target.checked
                        ? [...current, persona.id]
                        : current.filter((id) => id !== persona.id),
                    );
                  }}
                />
                {persona.name}
              </label>
            ))
          )}
        </div>
      </fieldset>

      <div className="md:col-span-2 border-t border-slate-200 pt-4">
        <p className="mb-3 text-sm font-medium text-slate-900">
          Campaign offer
        </p>
        <p className="mb-4 text-sm text-slate-600">
          Offers are campaign-specific. The same product and ICP can use
          different offers across campaigns.
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

      <div className="space-y-4 border-t border-slate-200 pt-4 md:col-span-2">
        <div>
          <p className="text-sm font-medium text-slate-900">Email length</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {EMAIL_LENGTH_OPTIONS.map((value) => (
              <label
                key={value}
                className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              >
                <input
                  type="radio"
                  name="emailLength"
                  value={value}
                  defaultChecked={
                    (restored?.emailLength ?? DEFAULT_EMAIL_LENGTH) === value
                  }
                />
                {value === "SHORT"
                  ? "Short"
                  : value === "MEDIUM"
                    ? "Medium"
                    : "Long"}
              </label>
            ))}
          </div>
        </div>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Email guidance</span>
          <span className="mt-1 block text-xs text-slate-500">
            Optional instructions for generated emails, up to{" "}
            {EMAIL_GUIDANCE_MAX_CHARS} characters.
          </span>
          <textarea
            name="emailGuidance"
            rows={3}
            maxLength={EMAIL_GUIDANCE_MAX_CHARS}
            defaultValue={restored?.emailGuidance}
            placeholder="Emphasize the free trial"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2"
          />
        </label>
      </div>

      <div className="md:col-span-2">
        <SubmitButton disabled={!canSubmit || pending}>
          {pending
            ? "Creating…"
            : canSubmit
              ? "Create campaign"
              : "Select product and ICP"}
        </SubmitButton>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createScoringRunAction,
  type ScoringRunActionResult,
} from "@/app/actions/scoring";
import { PrimaryButton, SecondaryButton } from "@/components/ui";

type Option = { id: string; name: string; productId: string };

const initial: ScoringRunActionResult | null = null;

export function ScoreListForm({
  contactListId,
  products,
  icps,
  personas,
}: {
  contactListId: string;
  products: Array<{ id: string; name: string }>;
  icps: Option[];
  personas: Option[];
}) {
  const [productId, setProductId] = useState("");
  const [icpId, setIcpId] = useState("");
  const [personaId, setPersonaId] = useState("");
  const [state, formAction, pending] = useActionState(
    createScoringRunAction,
    initial,
  );

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

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="contactListId" value={contactListId} />

      {state && !state.ok ? (
        <p
          role="status"
          data-testid="scoring-run-status"
          className="md:col-span-2 text-sm text-red-600"
        >
          {state.message}
        </p>
      ) : null}

      <label className="block text-sm md:col-span-2">
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

      <div className="md:col-span-2 flex gap-2">
        <PrimaryButton type="submit" disabled={!canSubmit || pending}>
          {pending ? "Creating…" : "Create Scoring Run"}
        </PrimaryButton>
        <SecondaryButton
          type="button"
          onClick={() => {
            setProductId("");
            setIcpId("");
            setPersonaId("");
          }}
        >
          Clear
        </SecondaryButton>
      </div>
    </form>
  );
}

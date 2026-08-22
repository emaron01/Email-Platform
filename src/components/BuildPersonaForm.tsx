"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  buildPersonaFromBuyerRoleAction,
  type PersonaSetupActionResult,
} from "@/app/actions/persona-setup";
import { Field, SubmitButton } from "@/components/ui";
import type { SuggestedBuyerRole } from "@/lib/product-research/contract";

const initial: PersonaSetupActionResult | null = null;

export function BuildPersonaForm({
  productId,
  role,
}: {
  productId: string;
  role: SuggestedBuyerRole | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    buildPersonaFromBuyerRoleAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok && state.personaSetupRunId) {
      router.push(
        `/setup/${productId}/personas/${state.personaSetupRunId}`,
      );
      router.refresh();
    }
  }, [state, productId, router]);

  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <input type="hidden" name="productId" value={productId} />
      <input
        type="hidden"
        name="suggestionKey"
        value={role?.suggestionKey ?? ""}
      />
      <Field
        label="Persona / Buyer Role Name"
        name="name"
        required
        defaultValue={role?.name ?? ""}
      />
      <Field
        label="Likely Titles"
        name="likelyTitles"
        defaultValue={(role?.likelyTitles ?? []).join(", ")}
        hint="Titles are evidence, not the Persona definition."
      />
      <Field
        label="Department / Function"
        name="departmentFunction"
        defaultValue={role?.departmentFunction ?? ""}
      />
      <Field
        label="Why this role matters"
        name="whyThisRoleMatters"
        as="textarea"
        defaultValue={role?.whyThisRoleMatters ?? ""}
      />
      <Field
        label="Optional Persona notes"
        name="notes"
        as="textarea"
        hint="Optional context. You can Build Persona with only the selected role."
      />
      <SubmitButton disabled={pending}>
        {pending ? "Researching Persona…" : "Build Persona"}
      </SubmitButton>
      {state ? (
        <p
          role="status"
          className={
            state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

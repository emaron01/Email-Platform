"use client";

import { useActionState } from "react";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  acceptInviteAction,
  type AcceptInviteActionResult,
} from "@/app/actions/invite";

/**
 * Logged-in accept UI — POST via Server Action so token lookup runs outside
 * RSC render (page render must not mutate cookies or accept as a side effect).
 */
export function AcceptInviteClient({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<
    AcceptInviteActionResult | null,
    FormData
  >(acceptInviteAction, null);

  return (
    <div className="space-y-4" data-testid="invite-accept-form">
      <p className="text-sm text-slate-600">
        You are signed in. Confirm below to join the workspace.
      </p>
      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          disabled={pending}
          className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
          data-testid="invite-accept-submit"
        >
          {pending ? "Joining…" : "Accept invitation"}
        </button>
      </form>
      {state && !state.ok ? (
        <p className="text-sm text-red-600" role="alert">
          {state.message}
        </p>
      ) : null}
      <p
        className="hidden"
        data-testid="invite-accept-token"
        data-token={token}
      >
        invite-accept
      </p>
    </div>
  );
}

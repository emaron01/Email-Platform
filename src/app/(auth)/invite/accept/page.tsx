import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { AcceptInviteClient } from "./AcceptInviteClient";

/**
 * Invitation accept landing for `/invite/accept?token=...`.
 * Public route (middleware allowlist).
 *
 * Order of work on this page (RSC render only — no cookie writes, no accept):
 *  1. Read `token` from searchParams
 *  2. Resolve session via getCurrentUser()
 *  3. Logged out → sign-in / sign-up links with `next` preserving the token
 *  4. Logged in → client form POSTs acceptInviteAction (Server Action)
 *
 * Do not mutate the cookie jar during this RSC render — Next only allows that
 * in a Server Action or Route Handler. The token lives in the URL (and login next=).
 */
async function AcceptInviteBody({ token }: { token: string | null }) {
  if (!token) {
    return (
      <div className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Invalid invitation
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          This invitation link is missing a token. Ask your workspace admin to
          resend the invite.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    const next = `/invite/accept?token=${encodeURIComponent(token)}`;
    return (
      <div className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Accept invitation
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in or create an account with the invited email to join the
          workspace.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
          >
            Sign in
          </Link>
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-800"
          >
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Accept invitation
      </h1>
      <div className="mt-4">
        <AcceptInviteClient token={token} />
      </div>
    </div>
  );
}

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const token = params.token?.trim() || null;

  return (
    <Suspense>
      <AcceptInviteBody token={token} />
    </Suspense>
  );
}

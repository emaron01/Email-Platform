import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { getInvitationPreviewByRawToken } from "@/lib/org/signup";
import { AcceptInviteClient } from "./AcceptInviteClient";

/**
 * Invitation accept landing for `/invite/accept?token=...`.
 * Public route (middleware allowlist).
 *
 * Order of work on this page (RSC render only — no cookie writes, no accept):
 *  1. Read `token` from searchParams
 *  2. Preview invitation (email + org) by token hash
 *  3. Resolve session via getCurrentUser()
 *  4. Logged out → sign-in / sign-up links with `next` preserving the token
 *  5. Logged in → show match/mismatch UI; accept only via Server Action POST
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

  const preview = await getInvitationPreviewByRawToken(token);
  if (!preview) {
    return (
      <div className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Invitation not found
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          This invitation link is invalid or no longer exists. Ask your
          workspace admin to send a new invite.
        </p>
      </div>
    );
  }

  const next = `/invite/accept?token=${encodeURIComponent(token)}`;
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Accept invitation
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          You were invited as{" "}
          <span className="font-medium text-slate-900">{preview.email}</span> to
          join{" "}
          <span className="font-medium text-slate-900">
            {preview.organizationName}
          </span>
          . Sign in with that email, or create an account (you will set a new
          password).
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
          >
            Sign in as {preview.email}
          </Link>
          <Link
            href={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(preview.email)}`}
            className="rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-800"
          >
            Create account
          </Link>
        </div>
      </div>
    );
  }

  const signedInEmail = user.email.trim().toLowerCase();
  const invitedEmail = preview.email.trim().toLowerCase();
  const emailMatches = signedInEmail === invitedEmail;

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Accept invitation
      </h1>
      <div className="mt-4">
        <AcceptInviteClient
          token={token}
          invitedEmail={preview.email}
          signedInEmail={user.email}
          organizationName={preview.organizationName}
          emailMatches={emailMatches}
        />
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

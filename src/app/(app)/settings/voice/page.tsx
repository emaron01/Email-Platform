import Link from "next/link";
import { EmailSignatureForm } from "@/components/EmailSignatureForm";
import { VoiceSamplesForm } from "@/components/VoiceSamplesForm";
import { requireCurrentUser } from "@/lib/auth/authz";
import { getEmailSignatureForUser } from "@/lib/signature/signature";
import type { EmailSignatureView } from "@/lib/signature/types";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";
import { listVoiceSamplesForUser } from "@/lib/voice/samples";

export default async function VoiceSettingsPage() {
  const user = await requireCurrentUser();
  const organization = await requireOrganization();
  const voiceSamples = await listVoiceSamplesForUser({
    organizationId: organization.id,
    userId: user.id,
  });

  let signature: EmailSignatureView | null = null;
  let signatureLoadError: string | null = null;
  try {
    signature = await getEmailSignatureForUser({
      organizationId: organization.id,
      userId: user.id,
    });
  } catch (error) {
    console.error("Failed to load email signature for settings/voice.", error);
    signatureLoadError =
      "Signature storage is not available yet. Apply the latest database migrations, then reload this page.";
  }

  return (
    <div className="mx-auto max-w-xl space-y-10">
      <div>
        <Link
          href="/settings"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Your Voice
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Writing samples for generation, and the signature appended when you
          send.
        </p>
      </div>

      {signatureLoadError ? (
        <p
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          {signatureLoadError}
        </p>
      ) : (
        <EmailSignatureForm signature={signature} />
      )}
      <VoiceSamplesForm samples={voiceSamples} />
    </div>
  );
}

import Link from "next/link";
import { VoiceSamplesForm } from "@/components/VoiceSamplesForm";
import { requireCurrentUser } from "@/lib/auth/authz";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";
import { listVoiceSamplesForUser } from "@/lib/voice/samples";

export default async function VoiceSettingsPage() {
  const user = await requireCurrentUser();
  const organization = await requireOrganization();
  const voiceSamples = await listVoiceSamplesForUser({
    organizationId: organization.id,
    userId: user.id,
  });

  return (
    <div className="mx-auto max-w-xl space-y-8">
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
      </div>

      <VoiceSamplesForm samples={voiceSamples} />
    </div>
  );
}

import {
  duplicateSharedCampaignAction,
  useSharedCampaignAction,
} from "@/app/actions/campaign-sharing";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Two clear choices on a SHARED campaign:
 * - Use this campaign → CampaignExecution (no copy; run on the shared template)
 * - Duplicate as mine → new PERSONAL campaign with config only
 */
export function SharedCampaignActions({ campaignId }: { campaignId: string }) {
  return (
    <div
      className="flex max-w-xs flex-col gap-2 text-left"
      data-testid="shared-campaign-actions"
    >
      <form action={useSharedCampaignAction}>
        <input type="hidden" name="campaignId" value={campaignId} />
        <button
          type="submit"
          className={cn(PRIMARY_BUTTON_CLASS, "w-full !px-3 !py-1.5")}
          title="Start your own run on this shared template. Contacts and emails stay tied to the shared campaign."
        >
          Use this campaign
        </button>
      </form>
      <p className="text-[11px] leading-snug text-slate-500">
        Run on the shared template as-is. You get your own execution — not a
        campaign you can reconfigure.
      </p>
      <form action={duplicateSharedCampaignAction}>
        <input type="hidden" name="campaignId" value={campaignId} />
        <button
          type="submit"
          className={cn(SECONDARY_BUTTON_CLASS, "w-full !px-3 !py-1.5")}
          title="Create a personal copy with the same product, ICP, personas, offer, and email guidance. Empty of contacts."
        >
          Duplicate as mine
        </button>
      </form>
      <p className="text-[11px] leading-snug text-slate-500">
        Make a personal copy you own and edit. Setup is copied; lists and
        contacts are not.
      </p>
    </div>
  );
}

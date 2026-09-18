import { useSharedCampaignAction } from "@/app/actions/campaign-sharing";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Use a SHARED template by creating a PERSONAL configuration-only copy.
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
          title="Create a personal copy with the same product, ICP, personas, offer, and email guidance. Empty of lists and contacts."
        >
          Use this campaign
        </button>
      </form>
      <p className="text-[11px] leading-snug text-slate-500">
        Creates a personal copy you own and can edit. Setup is copied; lists,
        contacts, drafts, and sends are not.
      </p>
    </div>
  );
}

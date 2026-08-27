/**
 * Daily send volume is advisory only: deeplink and confirmed sends leave from the
 * rep's mailbox, so the cap protects their domain reputation — not our cost.
 */
export function formatDailySendAdvisory(used: number): string {
  return `You've sent ${used} today. Sending more can hurt your domain's deliverability, especially on a newer domain.`;
}

export function deeplinkSendDeclinedStorageKey(
  draftId: string,
  handoffAt: string,
): string {
  return `deeplink-send-declined:${draftId}:${handoffAt}`;
}

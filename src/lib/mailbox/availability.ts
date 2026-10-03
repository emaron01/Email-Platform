import {
  planAllowsMicrosoft365Sending,
} from "@/lib/billing/plans";

export const MICROSOFT_365_SENDING_UNAVAILABLE_MESSAGE =
  "Microsoft 365 sending is not available for this workspace.";

export const MICROSOFT_365_SENDING_PLAN_MESSAGE =
  "Microsoft 365 sending can only be turned on for Team and Enterprise organizations.";

export function isMicrosoft365SendingAvailable(input: {
  planCode: string | null | undefined;
  enabled: boolean;
}): boolean {
  return input.enabled && planAllowsMicrosoft365Sending(input.planCode);
}
